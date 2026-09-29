// issues.ts: the node of the graph. Everything else is a field here or a row pointing at
// one (docs/design.md §3).
//
// `epicId` is required and there is no orphan state to represent, so a create with no
// epic does not fail vaguely: it throws `epic-required` carrying the open epics, and
// `cn create` prints them. ep-0 "Inbox" is the answer when none of them fits, and it is
// created by the first create that asks for it.
//
// A create answers with two facts beside the issue, each checked where the state is made
// rather than by a later run (§7). `near` is every live issue in the epic whose title is
// near-identical to the new one (lib/titles.ts), read before the insert and handed back
// while the issue is still created, so the reader decides whether it is a duplicate.
// `placed` says an issue bound for the inbox went beside its parent instead: §7's table
// moves that rule "at cn create", because a parent in an open epic is a fact and the
// inbox is only the answer when nothing says where the work belongs.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { actorValidator, sameSession } from "./lib/actor";
import type { Actor } from "./lib/actor";
import { nowArg } from "./lib/clock";
import { claimed, epicRequired, invalid } from "./lib/errors";
import { createFollowUp } from "./lib/followUp";
import { mutation, query } from "./lib/guard";
import { hasChild, issuesIn, issuesWhere } from "./lib/graph";
import { INBOX_ID, openEpicArg } from "./lib/inbox";
import {
  type IssueEdit,
  claimIssue,
  closeIssue,
  dropIssue,
  editIssue,
  insertIssue,
  releaseIssue,
} from "./lib/lifecycle";
import { addLinks, linkInputValidator } from "./lib/links";
import { epicById, issueById, projectBySlug } from "./lib/lookup";
import { idOrder, priorityOrder } from "./lib/order";
import { DEFAULT_PRIORITY } from "./lib/priority";
import { blockedBy, madeReadyBy } from "./lib/readiness";
import { expectRevision } from "./lib/revision";
import { nearIdentical } from "./lib/titles";
import {
  epicFinished,
  followUpKindValidator,
  isLive,
  issueStatusValidator,
  issueTypeValidator,
} from "./lib/validators";
import { verificationInputValidator } from "./lib/verification";
import { type Ref, issueView, ref } from "./lib/views";

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
    link: v.optional(v.array(linkInputValidator)),
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
    const asked = await openEpicArg(ctx, args.actor, args.epic);

    const type = args.type ?? "task";
    if (type === "follow-up" && args.followUpKind === undefined)
      throw invalid("a follow-up needs a kind: verify, decide or cleanup");
    if (type === "task" && args.followUpKind !== undefined)
      throw invalid("only a follow-up has a kind");

    const parent = args.parent === undefined ? null : await issueById(ctx, args.parent);

    // Bound for the inbox with a parent in an open epic: the parent says where it goes.
    const parentEpic =
      asked.id === INBOX_ID && parent !== null ? await ctx.db.get(parent.epicId) : null;
    const placed =
      parentEpic !== null && parentEpic.status === "open" && parentEpic.id !== INBOX_ID;
    const epic = placed ? parentEpic : asked;

    // Read before the insert, so the new issue is not its own match.
    const near: Ref[] = (await issuesIn(ctx, epic._id))
      .filter(isLive)
      .sort(idOrder)
      .filter((doc) => nearIdentical(doc.title, args.title))
      .map(ref);

    const created = await insertIssue(ctx, args.actor, {
      project,
      epicId: epic._id,
      title: args.title,
      description: args.description,
      design: args.design,
      acceptance: args.acceptance,
      type,
      followUpKind: args.followUpKind,
      parentIssueId: parent?._id,
      links: addLinks([], args.link ?? [], { by: args.actor, at: Date.now() }),
      priority: args.priority ?? DEFAULT_PRIORITY,
    });
    return { ...created, near, placed };
  },
});

/**
 * The flat list, narrowed by where an issue sits and who holds it, and by two questions
 * asked of its state: `silentFor` keeps what nobody has touched for at least that many
 * milliseconds, and `blocked` keeps what a live `blocks` edge holds, each row then carrying
 * `silentSince` or `blockedBy` as the answer to the question it was kept for.
 *
 * Both read live issues unless `status` asks for the others, because a closed or dropped
 * issue is silent and past holding by nature: without the default, every finished issue
 * would answer "silent" and bury the one that went quiet mid-work. Blocked stays derived,
 * read from the edges through `blockedBy` on every call and never stored (docs/design.md
 * §3, §4), so the list and `cn ready` answer the same question the same way.
 */
export const list = query({
  args: {
    project: v.optional(v.string()),
    epic: v.optional(v.string()),
    status: v.optional(issueStatusValidator),
    claimedBy: v.optional(v.string()),
    silentFor: v.optional(v.number()),
    blocked: v.optional(v.boolean()),
    ...nowArg,
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const project = args.project === undefined ? null : await projectBySlug(ctx, args.project);
    const epic = args.epic === undefined ? null : await epicById(ctx, args.epic);

    let rows = await issuesWhere(ctx, { project, epic, status: args.status });
    if (args.claimedBy !== undefined)
      rows = rows.filter((i) => i.claimedBy?.name === args.claimedBy);

    const narrowing = args.silentFor !== undefined || args.blocked === true;
    if (narrowing && args.status === undefined) rows = rows.filter(isLive);
    const silentFor = args.silentFor;
    if (silentFor !== undefined) rows = rows.filter((i) => now - i.lastActivity >= silentFor);

    // Read once per row: the holders both decide the row and are its answer.
    const holders = new Map<Id<"issues">, Ref[]>();
    if (args.blocked) {
      for (const doc of rows) {
        const { issues } = await blockedBy(ctx, doc, now);
        if (issues.length > 0) holders.set(doc._id, issues);
      }
      rows = rows.filter((i) => holders.has(i._id));
    }

    rows.sort(priorityOrder);
    return await Promise.all(
      rows.map(async (doc) => ({
        ...(await issueView(ctx, doc)),
        ...(silentFor !== undefined ? { silentSince: doc.lastActivity } : {}),
        ...(args.blocked ? { blockedBy: holders.get(doc._id)! } : {}),
      })),
    );
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
    link: v.optional(v.array(linkInputValidator)),
    unlink: v.optional(v.array(v.string())),
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
      deferUntil: args.deferUntil,
      epic: args.epic === undefined ? undefined : await openEpicArg(ctx, args.actor, args.epic),
      link: args.link,
      unlink: args.unlink,
    };
    return await issueView(ctx, await editIssue(ctx, args.actor, doc, edit));
  },
});

/**
 * Closing with a verification record, and the two facts §7 moved into the close.
 *
 * The follow-up: `--follow-up` creates it beside the parent in the same mutation, so a
 * parent never closes without its residue. An unverified close that came with none gets a
 * `verify:` follow-up spawned here instead, unless the issue already has a child of any
 * status (a dropped one was a decision). It is by the closer, never a system name.
 *
 * The offer: when this close finished the last issue of an open epic, `epicDone` carries
 * the epic and its revision so `cn close` can print the `cn epic close` line. It is an
 * answer, never a close. It waits for open follow-ups too, which makes it stricter than
 * `epics.close`: that one is driven by a person, who may close over routed residue (§5).
 *
 * Beside them, `madeReady` is every open issue this close was the last thing holding, as
 * the ready row `cn ready` would print (lib/readiness.ts). It is read, never stored.
 */
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
      : "unverified" in proof && !(await hasChild(ctx, doc._id))
        ? await createFollowUp(ctx, args.actor, doc, {
            title: `verify: ${doc.title}`,
            kind: "verify",
            description: `closed unverified: ${proof.unverified}`,
            priority: doc.priority,
          })
        : undefined;

    // Read after the spawn, so a follow-up it just made holds the offer back.
    const epic = await ctx.db.get(doc.epicId);
    const epicDone =
      epic !== null &&
      epic.status === "open" &&
      epic.id !== INBOX_ID &&
      epicFinished(await issuesIn(ctx, doc.epicId))
        ? { ...ref(epic), revision: epic.revision }
        : undefined;
    const madeReady = await madeReadyBy(ctx, closed);

    return { issue: await issueView(ctx, closed), followUp, epicDone, madeReady };
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
