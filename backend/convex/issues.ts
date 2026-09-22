// issues.ts: the node of the graph. Everything else is a field here or a row pointing at
// one (docs/design.md §3).
//
// `epicId` is required and there is no orphan state to represent, so a create with no
// epic does not fail vaguely: it throws `epic-required` carrying the open epics, and
// `cn create` prints them. ep-0 "Inbox" is the answer when none of them fits, and it is
// created by the first create that asks for it.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { actorValidator, sameSession } from "./lib/actor";
import type { Actor } from "./lib/actor";
import { claimed, epicRequired, invalid } from "./lib/errors";
import { createFollowUp } from "./lib/followUp";
import { mutation, query } from "./lib/guard";
import { issuesIn } from "./lib/graph";
import { openEpicArg } from "./lib/inbox";
import {
  type IssueEdit,
  claimIssue,
  closeIssue,
  dropIssue,
  editIssue,
  insertIssue,
  releaseIssue,
} from "./lib/lifecycle";
import { epicById, issueById, projectBySlug } from "./lib/lookup";
import { idOrder, priorityOrder } from "./lib/order";
import { DEFAULT_PRIORITY } from "./lib/priority";
import { expectRevision } from "./lib/revision";
import {
  followUpKindValidator,
  isLive,
  issueStatusValidator,
  issueTypeValidator,
} from "./lib/validators";
import { verificationInputValidator } from "./lib/verification";
import { issueView, ref } from "./lib/views";

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

    return await insertIssue(ctx, args.actor, {
      project,
      epicId: epic._id,
      title: args.title,
      description: args.description,
      design: args.design,
      acceptance: args.acceptance,
      type,
      followUpKind: args.followUpKind,
      parentIssueId: parent?._id,
      requires: args.requires ?? [],
      priority: args.priority ?? DEFAULT_PRIORITY,
    });
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

    return await issueView(ctx, await claimIssue(ctx, args.actor, doc));
  },
});

export const release = mutation({
  args: { actor: actorValidator, id: v.string() },
  handler: async (ctx, args) => {
    const doc = await issueById(ctx, args.id);
    if (!doc.claimedBy) return await issueView(ctx, doc);
    // A human may release anybody's claim; that is how a silent agent gets unstuck.
    if (fencedOut(doc, args.actor)) throw heldBy(doc);

    return await issueView(ctx, await releaseIssue(ctx, args.actor, doc));
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

    const edit: IssueEdit = {
      title: args.title,
      description: args.description,
      design: args.design,
      acceptance: args.acceptance,
      priority: args.priority,
      requires: args.requires,
      deferUntil: args.deferUntil,
      epic: args.epic === undefined ? undefined : await openEpicArg(ctx, args.actor, args.epic),
    };
    return await issueView(ctx, await editIssue(ctx, args.actor, doc, edit));
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

    const closed = await closeIssue(ctx, args.actor, doc, proof);

    // The residue is created in the same mutation, so a parent never closes without it.
    const followUp = args.followUp
      ? await createFollowUp(ctx, args.actor, doc, args.followUp)
      : undefined;
    return { issue: await issueView(ctx, closed), followUp };
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

    return await issueView(ctx, await dropIssue(ctx, args.actor, doc, args.reason));
  },
});
