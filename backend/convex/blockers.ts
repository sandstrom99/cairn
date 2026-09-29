// blockers.ts: the work no agent can do (docs/design.md §6). A blocker is an approval, an
// external wait, a decision, a credential or a purchase — its own table with its own
// lifecycle, raised → waiting → resolved, never a status on an issue.
//
// **Agents raise them, and end them only on the person's word.** `ack` and `resolve` refuse
// an actor of kind `agent` that carries no `said`, the person's words verbatim, and the
// events keep them (cn-87). That is a guardrail against an honest agent rather than a
// lock against a lying one, and on trust that is enough (docs/design.md §13).
//
// One blocker holds many issues, through `blockerLinks`: `raise` with `--on bl-3` attaches
// the one that already exists rather than minting a second row for the same wait, and
// resolving it frees every issue at once. Nothing is recomputed — `ready` asks the links
// live, so an issue is back the moment the blocker resolves.
//
// The event rule: an event that names an issue only because a blocker touched it carries
// no `revision`. The issue's revision did not move, and `expectRevision` reads an issue's
// history by revision, so a revision here would answer a stale write with somebody else's
// number. A raise and an attach carry both ids, so the issue's history and the blocker's
// each read them, the blocker's one line per issue it holds. The blocker's revision moves
// on ack, resolve and update, through `applyRevision`, and those name no issue.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { actorValidator } from "./lib/actor";
import { invalid } from "./lib/errors";
import { mutation, query } from "./lib/guard";
import { ackBlocker, editBlocker, resolveBlocker } from "./lib/lifecycle";
import { addLinks, linkInputValidator } from "./lib/links";
import { blockerById, issueById } from "./lib/lookup";
import { attachBlocker, raiseBlocker } from "./lib/raise";
import { expectRevision } from "./lib/revision";
import { blockerKindValidator, isLive } from "./lib/validators";
import { blockerView, ref } from "./lib/views";

/** `bl-3 was resolved by balder on 2026-09-17T…`: who ended it, so nobody reopens it. */
const alreadyResolved = (doc: Doc<"blockers">) =>
  invalid(
    `${doc.id} was resolved by ${doc.resolvedBy?.name ?? "somebody"} on ${new Date(
      doc.resolvedAt ?? doc._creationTime,
    ).toISOString()}`,
  );

/**
 * The person's words an ack or a resolve rests on, trimmed: an agent must carry them, a
 * person may. The refusal names who is waited on.
 */
function theirWord(
  doc: Doc<"blockers">,
  actor: { kind: string },
  said: string | undefined,
  verb: string,
): string | undefined {
  const words = said?.trim() || undefined;
  if (actor.kind === "agent" && words === undefined)
    throw invalid(
      `an agent can ${verb} ${doc.id} only on the person's word, given with --said; it waits on ${doc.owner}`,
    );
  return words;
}

export const raise = mutation({
  args: {
    actor: actorValidator,
    issue: v.string(),
    on: v.optional(v.string()),
    kind: v.optional(blockerKindValidator),
    owner: v.optional(v.string()),
    title: v.optional(v.string()),
    whatResolves: v.optional(v.string()),
    nudgeAt: v.optional(v.number()),
    link: v.optional(v.array(linkInputValidator)),
  },
  handler: async (ctx, args) => {
    const issue = await issueById(ctx, args.issue);
    if (!isLive(issue)) throw invalid(`${issue.id} is ${issue.status}; a blocker holds live work`);

    if (args.on !== undefined) {
      if (
        args.kind !== undefined ||
        args.owner !== undefined ||
        args.title !== undefined ||
        args.whatResolves !== undefined ||
        args.nudgeAt !== undefined ||
        args.link !== undefined
      )
        throw invalid("--on attaches an existing blocker; the other options describe a new one");
      const blocker = await blockerById(ctx, args.on);
      if (blocker.status === "resolved")
        throw invalid(`${blocker.id} is resolved; raise a new one`);
      // Idempotent, like edges.add: attaching the same blocker twice is one link.
      await attachBlocker(ctx, args.actor, blocker, issue);
      return { blocker: await blockerView(ctx, blocker), issue: ref(issue) };
    }

    // A new blocker is only useful if it says who must act and what would end it, so the
    // refusal names the first field missing rather than storing a wait nobody can answer.
    const required: [string, string | undefined][] = [
      ["kind", args.kind],
      ["owner", args.owner],
      ["title", args.title],
      ["resolves", args.whatResolves],
    ];
    const missing = required.find(([, value]) => value === undefined || value.trim() === "");
    if (missing) throw invalid(`a new blocker needs --${missing[0]}`);

    const blocker = await raiseBlocker(ctx, args.actor, issue, {
      kind: args.kind!,
      owner: args.owner!,
      title: args.title!,
      whatResolves: args.whatResolves!,
      links: addLinks([], args.link ?? [], { by: args.actor, at: Date.now() }),
      ...(args.nudgeAt === undefined ? {} : { nudgeAt: args.nudgeAt }),
    });
    return { blocker: await blockerView(ctx, blocker), issue: ref(issue) };
  },
});

/**
 * A blocker's title, what resolves it and its links, against the revision the writer
 * read. Kind and owner stay as raised. It does not refuse an agent: agents raise blockers
 * and may put their words right, and only ending one is a person's. A resolved blocker is
 * history and does not change.
 */
export const update = mutation({
  args: {
    actor: actorValidator,
    id: v.string(),
    revision: v.number(),
    title: v.optional(v.string()),
    whatResolves: v.optional(v.string()),
    link: v.optional(v.array(linkInputValidator)),
    unlink: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const doc = await blockerById(ctx, args.id);
    await expectRevision(ctx, { table: "blockers", doc }, args.revision);
    if (doc.status === "resolved") throw alreadyResolved(doc);

    const edited = await editBlocker(ctx, args.actor, doc, {
      title: args.title,
      whatResolves: args.whatResolves,
      link: args.link,
      unlink: args.unlink,
    });
    return await blockerView(ctx, edited);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    // Raised before acknowledged: what nobody has looked at yet is the head of the list.
    // Resolved ones are never here; they are history, and `cn show` is where history is.
    const rows: Doc<"blockers">[] = [];
    for (const status of ["raised", "waiting"] as const) {
      const batch = await ctx.db
        .query("blockers")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      batch.sort((a, b) => a._creationTime - b._creationTime);
      rows.push(...batch);
    }
    return await Promise.all(rows.map((doc) => blockerView(ctx, doc)));
  },
});

export const ack = mutation({
  args: { actor: actorValidator, id: v.string(), said: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const doc = await blockerById(ctx, args.id);
    const said = theirWord(doc, args.actor, args.said, "acknowledge");
    if (doc.status === "resolved") throw alreadyResolved(doc);
    // Idempotent: a person who says "seen" twice has seen it once.
    if (doc.status === "waiting") return await blockerView(ctx, doc);

    return await blockerView(ctx, await ackBlocker(ctx, args.actor, doc, said));
  },
});

export const resolve = mutation({
  args: { actor: actorValidator, id: v.string(), note: v.string(), said: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const doc = await blockerById(ctx, args.id);
    const said = theirWord(doc, args.actor, args.said, "resolve");
    if (args.note.trim() === "") throw invalid("a resolution says what happened");
    if (doc.status === "resolved") throw alreadyResolved(doc);

    return await blockerView(ctx, await resolveBlocker(ctx, args.actor, doc, args.note, said));
  },
});
