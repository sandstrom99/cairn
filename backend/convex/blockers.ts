// blockers.ts: the work no agent can do (docs/design.md §6). A blocker is an approval, an
// external wait, a decision, a credential or a purchase — its own table with its own
// lifecycle, raised → waiting → resolved, never a status on an issue.
//
// **Agents raise them. Agents may never resolve them.** `ack` and `resolve` refuse an
// actor of kind `agent`, which until auth exists is a guardrail against an honest agent
// rather than a lock against a lying one, and that is enough.
//
// One blocker holds many issues, through `blockerLinks`: `raise` with `--on bl-3` attaches
// the one that already exists rather than minting a second row for the same wait, and
// resolving it frees every issue at once. Nothing is recomputed — `ready` asks the links
// live, so an issue is back the moment the blocker resolves.
//
// The event rule: an event that names an issue only because a blocker touched it carries
// no `revision`. The issue's revision did not move, and `expectRevision` reads an issue's
// history by revision, so a revision here would answer a stale write with somebody else's
// number. It names the blocker in its `changes` rather than in `blockerId`, so the
// blocker's own history stays one line per action instead of one per issue it held. The
// blocker's revision moves on ack and resolve alone, through `applyRevision`.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { actorValidator } from "./lib/actor";
import { invalid } from "./lib/errors";
import { record } from "./lib/events";
import { LIVE, blockerById, issueById } from "./lib/lookup";
import { attachBlocker, raiseBlocker } from "./lib/raise";
import { applyRevision } from "./lib/revision";
import { blockerView, ref } from "./lib/views";

const kindValidator = v.union(
  v.literal("approval"),
  v.literal("external-wait"),
  v.literal("decision"),
  v.literal("credential"),
  v.literal("purchase"),
);

/** `bl-3 was resolved by balder on 2026-09-17T…`: who ended it, so nobody reopens it. */
const alreadyResolved = (doc: Doc<"blockers">) =>
  invalid(
    `${doc.id} was resolved by ${doc.resolvedBy?.name ?? "somebody"} on ${new Date(
      doc.resolvedAt ?? doc._creationTime,
    ).toISOString()}`,
  );

/** Only a person ends a wait on a person. The refusal names who is actually waited on. */
function refuseAgent(doc: Doc<"blockers">, actor: { kind: string }, verb: string): void {
  if (actor.kind === "agent")
    throw invalid(`only a person can ${verb} ${doc.id}; it waits on ${doc.owner}`);
}

export const raise = mutation({
  args: {
    actor: actorValidator,
    issue: v.string(),
    on: v.optional(v.string()),
    kind: v.optional(kindValidator),
    owner: v.optional(v.string()),
    title: v.optional(v.string()),
    whatResolves: v.optional(v.string()),
    nudgeAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const issue = await issueById(ctx, args.issue);
    if (!LIVE.includes(issue.status))
      throw invalid(`${issue.id} is ${issue.status}; a blocker holds live work`);

    if (args.on !== undefined) {
      if (
        args.kind !== undefined ||
        args.owner !== undefined ||
        args.title !== undefined ||
        args.whatResolves !== undefined ||
        args.nudgeAt !== undefined
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
      ...(args.nudgeAt === undefined ? {} : { nudgeAt: args.nudgeAt }),
    });
    return { blocker: await blockerView(ctx, blocker), issue: ref(issue) };
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
  args: { actor: actorValidator, id: v.string() },
  handler: async (ctx, args) => {
    const doc = await blockerById(ctx, args.id);
    refuseAgent(doc, args.actor, "acknowledge");
    if (doc.status === "resolved") throw alreadyResolved(doc);
    // Idempotent: a person who says "seen" twice has seen it once.
    if (doc.status === "waiting") return await blockerView(ctx, doc);

    await applyRevision(
      ctx,
      { table: "blockers", doc },
      { status: "waiting" },
      { kind: "blocker.ack", actor: args.actor },
    );
    return await blockerView(ctx, (await ctx.db.get(doc._id))!);
  },
});

export const resolve = mutation({
  args: { actor: actorValidator, id: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    const doc = await blockerById(ctx, args.id);
    refuseAgent(doc, args.actor, "resolve");
    if (args.note.trim() === "") throw invalid("a resolution says what happened");
    if (doc.status === "resolved") throw alreadyResolved(doc);

    await applyRevision(
      ctx,
      { table: "blockers", doc },
      {
        status: "resolved",
        resolvedBy: args.actor,
        resolvedAt: Date.now(),
        resolution: args.note,
      },
      {
        kind: "blocker.resolve",
        actor: args.actor,
        // The computed map would print the timestamp and the whole actor object; the two
        // fields a reader wants are what it moved to and what was said.
        changes: { status: { from: doc.status, to: "resolved" }, resolution: { to: args.note } },
      },
    );

    // One event per issue it held, so `cn show <issue> --history` says what freed it.
    const links = await ctx.db
      .query("blockerLinks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", doc._id))
      .collect();
    for (const link of links)
      await record(ctx, {
        kind: "blocker.resolve",
        actor: args.actor,
        issueId: link.issueId,
        changes: { blocker: doc.id, title: doc.title, resolution: args.note },
      });
    return await blockerView(ctx, (await ctx.db.get(doc._id))!);
  },
});
