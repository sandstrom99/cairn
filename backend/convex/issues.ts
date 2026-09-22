// issues.ts: the node of the graph. Everything else is a field here or a row pointing at
// one (docs/design.md §3).
//
// `epicId` is required and there is no orphan state to represent, so a create with no
// epic does not fail vaguely: it throws `epic-required` carrying the open epics, and
// `cn create` prints them. ep-0 "Inbox" is the answer when none of them fits, and it is
// created by the first create that asks for it.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { actorValidator, sameSession } from "./lib/actor";
import type { Actor } from "./lib/actor";
import {
  claimChanges,
  closeChanges,
  createdChanges,
  dropChanges,
  releaseChanges,
} from "./lib/changes";
import { claimed, epicRequired, invalid } from "./lib/errors";
import { record } from "./lib/events";
import { createFollowUp } from "./lib/followUp";
import { mutation, query } from "./lib/guard";
import { issuesIn } from "./lib/graph";
import { mint } from "./lib/ids";
import { openEpicArg } from "./lib/inbox";
import { epicById, issueById, projectBySlug } from "./lib/lookup";
import { idOrder, priorityOrder } from "./lib/order";
import { DEFAULT_PRIORITY, checkPriority } from "./lib/priority";
import { applyRevision, expectRevision } from "./lib/revision";
import {
  followUpKindValidator,
  isLive,
  issueStatusValidator,
  issueTypeValidator,
} from "./lib/validators";
import { verificationInputValidator } from "./lib/verification";
import { issueView, ref } from "./lib/views";

/** The view of an issue as it now stands, read back after a patch. */
const viewOf = async (ctx: MutationCtx, _id: Id<"issues">) =>
  await issueView(ctx, (await ctx.db.get(_id))!);

/**
 * `claimed`, with the two fields narrowed: every caller has tested `claimedBy` first.
 * With the asker given, a holder of the same name is named as another session, so an
 * agent refused under its own name is told what the difference is.
 */
const heldBy = (doc: Doc<"issues">, asker?: Actor) =>
  claimed(
    {
      id: doc.id,
      claimedBy: doc.claimedBy!,
      claimedAt: doc.claimedAt ?? doc.lastActivity,
    },
    asker !== undefined && asker.name === doc.claimedBy!.name,
  );

/** True when `actor` may not touch a claim it does not hold: a human may, an agent may not. */
const fencedOut = (doc: Doc<"issues">, actor: Actor): boolean =>
  doc.claimedBy !== undefined && doc.claimedBy.name !== actor.name && actor.kind === "agent";

export const create = mutation({
  args: {
    actor: actorValidator,
    project: v.string(),
    epic: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    design: v.optional(v.string()),
    acceptance: v.optional(v.string()),
    priority: v.optional(v.number()),
    type: v.optional(issueTypeValidator),
    followUpKind: v.optional(followUpKindValidator),
    parent: v.optional(v.string()),
    requires: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const project = await projectBySlug(ctx, args.project);

    if (args.epic === undefined) {
      const open = await ctx.db
        .query("epics")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .collect();
      open.sort(idOrder);
      throw epicRequired(open.map(ref));
    }
    const epic = await openEpicArg(ctx, args.actor, args.epic);

    const type = args.type ?? "task";
    if (type === "follow-up" && args.followUpKind === undefined)
      throw invalid("a follow-up needs a kind: verify, decide or cleanup");
    if (type === "task" && args.followUpKind !== undefined)
      throw invalid("only a follow-up has a kind");

    const parent = args.parent === undefined ? null : await issueById(ctx, args.parent);

    const priority = checkPriority(args.priority ?? DEFAULT_PRIORITY);

    const n = await mint(ctx, project.slug);
    const _id = await ctx.db.insert("issues", {
      id: `${project.slug}-${n}`,
      projectId: project._id,
      epicId: epic._id,
      title: args.title,
      ...(args.description === undefined ? {} : { description: args.description }),
      ...(args.design === undefined ? {} : { design: args.design }),
      ...(args.acceptance === undefined ? {} : { acceptance: args.acceptance }),
      type,
      ...(args.followUpKind === undefined ? {} : { followUpKind: args.followUpKind }),
      ...(parent === null ? {} : { parentIssueId: parent._id }),
      requires: args.requires ?? [],
      status: "open",
      priority,
      lastActivity: Date.now(),
      revision: 0,
    });
    const view = await issueView(ctx, (await ctx.db.get(_id))!);
    await record(ctx, {
      kind: "issue.create",
      actor: args.actor,
      issueId: _id,
      epicId: epic._id,
      revision: 0,
      changes: createdChanges(view),
    });
    return view;
  },
});

export const list = query({
  args: {
    project: v.optional(v.string()),
    epic: v.optional(v.string()),
    status: v.optional(issueStatusValidator),
    claimedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // One index does the work and the rest of the filters run in memory: a company's
    // worth of issues is a few hundred documents, two orders off Convex's 16,384 cap.
    const project = args.project === undefined ? null : await projectBySlug(ctx, args.project);
    const epic = args.epic === undefined ? null : await epicById(ctx, args.epic);

    let rows: Doc<"issues">[];
    if (epic) {
      rows = await issuesIn(ctx, epic._id);
    } else if (project) {
      rows = await ctx.db
        .query("issues")
        .withIndex("by_project", (q) =>
          args.status === undefined
            ? q.eq("projectId", project._id)
            : q.eq("projectId", project._id).eq("status", args.status),
        )
        .collect();
    } else if (args.status !== undefined) {
      rows = await ctx.db
        .query("issues")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      rows = await ctx.db.query("issues").collect();
    }

    if (project) rows = rows.filter((i) => i.projectId === project._id);
    if (args.status !== undefined) rows = rows.filter((i) => i.status === args.status);
    if (args.claimedBy !== undefined)
      rows = rows.filter((i) => i.claimedBy?.name === args.claimedBy);
    rows.sort(priorityOrder);
    return await Promise.all(rows.map((doc) => issueView(ctx, doc)));
  },
});

// The lifecycle: claim → journal → close, and drop for what is not going to happen
// (docs/design.md §5). Claim and release take no `revision`, because a second writer to a
// claim is not stale — it needs to be told who holds it. Everything else takes the
// revision it read and is refused with the history when that has moved.

export const claim = mutation({
  args: { actor: actorValidator, id: v.string() },
  handler: async (ctx, args) => {
    const doc = await issueById(ctx, args.id);
    if (!isLive(doc))
      throw invalid(
        `${doc.id} is ${doc.status}; reopening is not a thing, create a follow-up instead`,
      );
    // Idempotent for the same session: a session that claims twice has claimed once. Two
    // sessions of one name are two claimants, so the second is refused like anybody else.
    if (doc.claimedBy && sameSession(doc.claimedBy, args.actor)) return await issueView(ctx, doc);
    if (doc.claimedBy) throw heldBy(doc, args.actor);

    const now = Date.now();
    await applyRevision(
      ctx,
      { table: "issues", doc },
      { status: "in_progress", claimedBy: args.actor, claimedAt: now, lastActivity: now },
      { kind: "issue.claim", actor: args.actor, changes: claimChanges(doc, args.actor) },
    );
    return await viewOf(ctx, doc._id);
  },
});

export const release = mutation({
  args: { actor: actorValidator, id: v.string() },
  handler: async (ctx, args) => {
    const doc = await issueById(ctx, args.id);
    if (!doc.claimedBy) return await issueView(ctx, doc);
    // A human may release anybody's claim; that is how a silent agent gets unstuck.
    if (fencedOut(doc, args.actor)) throw heldBy(doc);

    const now = Date.now();
    await applyRevision(
      ctx,
      { table: "issues", doc },
      { status: "open", claimedBy: undefined, claimedAt: undefined, lastActivity: now },
      { kind: "issue.release", actor: args.actor, changes: releaseChanges(doc) },
    );
    return await viewOf(ctx, doc._id);
  },
});

export const update = mutation({
  args: {
    actor: actorValidator,
    id: v.string(),
    revision: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    design: v.optional(v.string()),
    acceptance: v.optional(v.string()),
    priority: v.optional(v.number()),
    epic: v.optional(v.string()),
    // null clears the date; absent leaves it alone. The two are different intentions.
    deferUntil: v.optional(v.union(v.number(), v.null())),
    requires: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const doc = await issueById(ctx, args.id);
    await expectRevision(ctx, { table: "issues", doc }, args.revision);
    if (!isLive(doc)) throw invalid(`${doc.id} is ${doc.status}; nothing about it changes now`);

    const patch: Record<string, unknown> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const set = (field: string, from: unknown, to: unknown) => {
      patch[field] = to;
      changes[field] = { from, to };
    };
    if (args.title !== undefined) set("title", doc.title, args.title);
    if (args.description !== undefined) set("description", doc.description, args.description);
    if (args.design !== undefined) set("design", doc.design, args.design);
    if (args.acceptance !== undefined) set("acceptance", doc.acceptance, args.acceptance);
    if (args.priority !== undefined) set("priority", doc.priority, checkPriority(args.priority));
    if (args.requires !== undefined) set("requires", doc.requires, args.requires);
    if (args.deferUntil !== undefined) {
      // null clears the field; the change is recorded as null so the history reads as
      // "to nothing" rather than dropping the key.
      patch.deferUntil = args.deferUntil ?? undefined;
      changes.deferUntil = { from: doc.deferUntil ?? null, to: args.deferUntil };
    }
    if (args.epic !== undefined) {
      const epic = await openEpicArg(ctx, args.actor, args.epic);
      const was = await ctx.db.get(doc.epicId);
      patch.epicId = epic._id;
      // Recorded as the two public ids: nothing outside the deployment knows a Convex id.
      changes.epic = { from: was?.id, to: epic.id };
    }
    if (Object.keys(patch).length === 0) throw invalid("nothing to update");

    // lastActivity is stamped by every write and is noise in a history line, so the
    // recorded changes are what the caller asked for and not the housekeeping beside it.
    patch.lastActivity = Date.now();
    await applyRevision(ctx, { table: "issues", doc }, patch, {
      kind: "issue.update",
      actor: args.actor,
      changes,
    });
    return await viewOf(ctx, doc._id);
  },
});

export const close = mutation({
  args: {
    actor: actorValidator,
    id: v.string(),
    revision: v.number(),
    verification: verificationInputValidator,
    followUp: v.optional(
      v.object({
        title: v.string(),
        kind: followUpKindValidator,
        requires: v.optional(v.array(v.string())),
        priority: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const doc = await issueById(ctx, args.id);
    await expectRevision(ctx, { table: "issues", doc }, args.revision);
    if (!isLive(doc)) throw invalid(`${doc.id} is already ${doc.status}`);
    if (fencedOut(doc, args.actor)) throw heldBy(doc);

    const proof = args.verification;
    if ("exitCode" in proof && proof.exitCode !== 0)
      throw invalid(
        `${proof.command} exited ${proof.exitCode}; fix it, or close --unverified with a reason`,
      );
    if ("unverified" in proof && proof.unverified.trim() === "")
      throw invalid("an unverified close needs a reason");

    const now = Date.now();
    await applyRevision(
      ctx,
      { table: "issues", doc },
      {
        status: "closed",
        closedAt: now,
        verification: { ...proof, at: now, by: args.actor },
        claimedBy: undefined,
        claimedAt: undefined,
        lastActivity: now,
      },
      { kind: "issue.close", actor: args.actor, changes: closeChanges(doc, proof) },
    );

    // The residue is created in the same mutation, so a parent never closes without it.
    const followUp = args.followUp
      ? await createFollowUp(ctx, args.actor, doc, args.followUp)
      : undefined;
    return { issue: await viewOf(ctx, doc._id), followUp };
  },
});

export const drop = mutation({
  args: { actor: actorValidator, id: v.string(), revision: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const doc = await issueById(ctx, args.id);
    await expectRevision(ctx, { table: "issues", doc }, args.revision);
    if (!isLive(doc)) throw invalid(`${doc.id} is already ${doc.status}`);
    if (args.reason.trim() === "") throw invalid("dropping needs a reason");
    if (fencedOut(doc, args.actor)) throw heldBy(doc);

    const now = Date.now();
    await applyRevision(
      ctx,
      { table: "issues", doc },
      {
        status: "dropped",
        droppedReason: args.reason,
        closedAt: now,
        claimedBy: undefined,
        claimedAt: undefined,
        lastActivity: now,
      },
      { kind: "issue.drop", actor: args.actor, changes: dropChanges(doc, args.reason) },
    );
    return await viewOf(ctx, doc._id);
  },
});
