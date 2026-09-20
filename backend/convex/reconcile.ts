// reconcile.ts: the answer to clutter, one epic at a time (docs/design.md §7).
//
// **Facts yes, judgement asks.** Five rules act on their own, because each of them tests
// a fact and has exactly one right answer: an inbox issue whose parent sits in exactly
// one open epic is reparented, a claim gone silent past the threshold is released, a
// close marked unverified with no follow-up beside it gets one, a `blocks` edge into a
// finished issue is dropped, and an epic with every issue finished is closed. Three rules
// do not act: near-identical titles, an inbox item gone stale, a blocker past its nudge.
// Each of those is raised as a human blocker addressed to `owner`, so reconcile's
// questions arrive through the same mechanism as everything else waiting on a person.
//
// **Every write it makes is by `RECONCILE`** (lib/actor.ts), never by the caller, so a
// raise can be told from one an agent wrote by hand and `brief.get` can count them. The
// caller is recorded once, in the run event. The thresholds are in lib/thresholds.ts,
// where epic health reads the same numbers.
//
// **It is idempotent.** Each fact rule tests the state it would create, and every raise
// has a deterministic title that is looked up before it is asked again — so a question
// already resolved is never asked twice. Run it twice and the second run acts on nothing.
//
// The rules run in the order they are numbered in §7: reparent, release, spawn, drop
// edges, then close the epic, then the three raises. Closing comes after the four that
// can finish an epic's last issue, so one run both empties an epic and closes it.
//
// **The sweep is the same rules over every open epic**, on a daily cron (crons.ts). It
// fans out through the scheduler, one epic per transaction, so an epic that throws fails
// alone and the rest of the sweep still lands. It is off until `CAIRN_OWNER` is set on the
// deployment, which is how a deployment turns it on once reconcile by hand has earned the
// trust. It records one `reconcile.sweep` event; a swept epic records its `reconcile.run`
// only when something happened, since a row a day per quiet epic is noise.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
// An internal function cannot be reached from outside the deployment, so it carries no
// secret and does not go through lib/guard: there is nothing for a caller to prove.
import { type MutationCtx, internalMutation } from "./_generated/server";
import { type Actor, RECONCILE, actorValidator } from "./lib/actor";
import { deploymentEnv } from "./lib/env";
import { invalid } from "./lib/errors";
import { record } from "./lib/events";
import { createFollowUp } from "./lib/followUp";
import { mutation } from "./lib/guard";
import { INBOX_ID } from "./lib/inbox";
import { LIVE, epicById, issueOrder } from "./lib/lookup";
import { attachBlocker, raiseBlocker } from "./lib/raise";
import { applyRevision } from "./lib/revision";
import { CLAIM_SILENT_MS, INBOX_STALE_MS, NEAR_TITLE_DISTANCE } from "./lib/thresholds";
import { type Ref, ref } from "./lib/views";

/** What reconcile did on its own, one entry per write, named the way `cn` prints it. */
type Did =
  | { rule: "reparent"; issue: Ref; to: Ref }
  | { rule: "release"; issue: Ref; from: Actor; silentMs: number }
  | { rule: "spawn-follow-up"; issue: Ref; followUp: Ref }
  | { rule: "drop-edge"; from: Ref; to: Ref }
  | { rule: "close-epic"; epic: Ref };

/** What it handed to a person instead, one entry per blocker raised. */
type Raised = {
  rule: "duplicate" | "inbox-age" | "nudge";
  blocker: Ref;
  issues: Ref[];
  /** The blocker a nudge is about; the other two rules are about issues alone. */
  about?: Ref;
};

const issuesIn = async (ctx: MutationCtx, epicId: Id<"epics">): Promise<Doc<"issues">[]> =>
  await ctx.db
    .query("issues")
    .withIndex("by_epic", (q) => q.eq("epicId", epicId))
    .collect();

const isLive = (doc: Doc<"issues">): boolean => LIVE.includes(doc.status);

/**
 * Lowercase, every run of anything but letters and digits one space, trimmed: what "same
 * title" means. Letters in any script, so `næste` and `naste` stay two words apart.
 */
const normalise = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Edit distance, two rows at a time. The titles compared are a line long. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = row;
  }
  return prev[b.length]!;
}

/** The unresolved blockers holding `issue`, newest link last. */
async function blockersOn(ctx: MutationCtx, issue: Doc<"issues">): Promise<Doc<"blockers">[]> {
  const links = await ctx.db
    .query("blockerLinks")
    .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
    .collect();
  const docs = await Promise.all(links.map((l) => ctx.db.get(l.blockerId)));
  return docs.filter((b): b is Doc<"blockers"> => b !== null && b.status !== "resolved");
}

/** The live issues a blocker holds, in id order. */
async function issuesHeldBy(ctx: MutationCtx, blocker: Doc<"blockers">): Promise<Doc<"issues">[]> {
  const links = await ctx.db
    .query("blockerLinks")
    .withIndex("by_blocker", (q) => q.eq("blockerId", blocker._id))
    .collect();
  const docs = await Promise.all(links.map((l) => ctx.db.get(l.issueId)));
  return docs.filter((i): i is Doc<"issues"> => i !== null && isLive(i)).sort(issueOrder);
}

/**
 * True when reconcile has asked this exact question before, resolved or not. The title is
 * deterministic, so it is the idempotency key: `blockers` has no index on raiser or title
 * and does not need one, since the table is one row per thing a person owes an answer to.
 */
async function alreadyAsked(ctx: MutationCtx, title: string): Promise<boolean> {
  const rows = await ctx.db.query("blockers").collect();
  return rows.some((b) => b.raisedBy.name === RECONCILE.name && b.title === title);
}

/**
 * The eight rules over one open epic. `run` and the sweep both end here, so the sweep
 * cannot drift from what a person gets by hand.
 */
async function reconcileEpic(
  ctx: MutationCtx,
  epic: Doc<"epics">,
  opts: { by: string; owner: string; recordWhenQuiet: boolean },
): Promise<{ epic: Ref; at: number; did: Did[]; raised: Raised[] }> {
  const inbox = await ctx.db
    .query("epics")
    .withIndex("by_public_id", (q) => q.eq("id", INBOX_ID))
    .unique();
  const isInbox = epic.id === INBOX_ID;
  const now = Date.now();
  const did: Did[] = [];
  const raised: Raised[] = [];

  // R1, reparent. "Exactly one epic matches" is a fact test, not a guess: the inbox
  // issue's parent and its `discovered-from` issues sit in exactly one open epic
  // between them. Two candidates is a judgement, so it is left alone.
  if (inbox) {
    for (const issue of (await issuesIn(ctx, inbox._id)).filter(isLive)) {
      const candidates = new Map<Id<"epics">, Doc<"epics">>();
      const consider = async (epicId: Id<"epics">) => {
        const doc = await ctx.db.get(epicId);
        if (doc && doc.status === "open" && doc.id !== INBOX_ID) candidates.set(doc._id, doc);
      };
      if (issue.parentIssueId) {
        const parent = await ctx.db.get(issue.parentIssueId);
        if (parent) await consider(parent.epicId);
      }
      const discovered = await ctx.db
        .query("edges")
        .withIndex("by_from", (q) => q.eq("from", issue._id).eq("type", "discovered-from"))
        .collect();
      for (const edge of discovered) {
        const to = await ctx.db.get(edge.to);
        if (to) await consider(to.epicId);
      }
      if (candidates.size !== 1) continue;
      const target = [...candidates.values()][0]!;
      // Reconciling the inbox routes out of it; reconciling an epic pulls into itself.
      if (!isInbox && target._id !== epic._id) continue;
      await applyRevision(
        ctx,
        { table: "issues", doc: issue },
        { epicId: target._id, lastActivity: now },
        {
          kind: "issue.update",
          actor: RECONCILE,
          // The two public ids, the way `issues.update` records an epic change.
          changes: { epic: { from: INBOX_ID, to: target.id } },
        },
      );
      did.push({ rule: "reparent", issue: ref(issue), to: ref(target) });
    }
  }

  // R3, release a silent claim. No fencing: reconcile is precisely the thing that
  // releases another actor's claim, which `issues.release` refuses to let an agent do.
  for (const issue of await issuesIn(ctx, epic._id)) {
    if (issue.status !== "in_progress") continue;
    const silentMs = now - issue.lastActivity;
    if (silentMs <= CLAIM_SILENT_MS) continue;
    const from = issue.claimedBy;
    await applyRevision(
      ctx,
      { table: "issues", doc: issue },
      { status: "open", claimedBy: undefined, claimedAt: undefined, lastActivity: now },
      { kind: "issue.release", actor: RECONCILE },
    );
    if (from) did.push({ rule: "release", issue: ref(issue), from, silentMs });
  }

  // R4, the follow-up an unverified close never got. Any child at all counts as spawned,
  // whatever its status: a dropped one was a decision, and re-spawning it would undo it.
  for (const issue of await issuesIn(ctx, epic._id)) {
    if (issue.status !== "closed") continue;
    const proof = issue.verification;
    if (!proof || !("unverified" in proof)) continue;
    const children = await ctx.db
      .query("issues")
      .withIndex("by_parent", (q) => q.eq("parentIssueId", issue._id))
      .collect();
    if (children.length > 0) continue;
    const followUp = await createFollowUp(ctx, RECONCILE, issue, {
      title: `verify: ${issue.title}`,
      kind: "verify",
      description: `closed unverified: ${proof.unverified}`,
      priority: issue.priority,
    });
    did.push({ rule: "spawn-follow-up", issue: ref(issue), followUp: ref(followUp) });
  }

  // R5, a `blocks` edge with a finished end. It holds nothing back already (§4), so the
  // row is noise in every graph read until it is gone.
  const seenEdges = new Set<Id<"edges">>();
  for (const issue of await issuesIn(ctx, epic._id)) {
    const touching = [
      ...(await ctx.db
        .query("edges")
        .withIndex("by_from", (q) => q.eq("from", issue._id).eq("type", "blocks"))
        .collect()),
      ...(await ctx.db
        .query("edges")
        .withIndex("by_to", (q) => q.eq("to", issue._id).eq("type", "blocks"))
        .collect()),
    ];
    for (const edge of touching) {
      if (seenEdges.has(edge._id)) continue;
      seenEdges.add(edge._id);
      const from = await ctx.db.get(edge.from);
      const to = await ctx.db.get(edge.to);
      if (!from || !to) continue;
      if (isLive(from) && isLive(to)) continue;
      await ctx.db.delete(edge._id);
      const changes = { type: "blocks", from: from.id, to: to.id };
      for (const issueId of [from._id, to._id])
        await record(ctx, { kind: "edge.remove", actor: RECONCILE, issueId, changes });
      did.push({ rule: "drop-edge", from: ref(from), to: ref(to) });
    }
  }

  // R2, close the epic. Stricter than `epics.close`, which a person drives: an open
  // follow-up stops reconcile and does not stop a person (§7's table against §5's
  // routed residue). An epic with no task in it was never worked, so it stays open.
  if (!isInbox) {
    const issues = await issuesIn(ctx, epic._id);
    if (issues.some((i) => i.type === "task") && !issues.some(isLive)) {
      await applyRevision(
        ctx,
        { table: "epics", doc: epic },
        { status: "closed" },
        { kind: "epic.close", actor: RECONCILE },
      );
      did.push({ rule: "close-epic", epic: ref(epic) });
    }
  }

  // J6, two live issues that read as the same work. Which one survives is a judgement,
  // and the wrong answer loses work, so both are named and neither is touched.
  const live = (await issuesIn(ctx, epic._id)).filter(isLive).sort(issueOrder);
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      const left = normalise(a.title);
      const right = normalise(b.title);
      if (left !== right && distance(left, right) > NEAR_TITLE_DISTANCE) continue;
      // A `duplicates` edge is the answer already given, in either direction.
      const marked = [
        ...(await ctx.db
          .query("edges")
          .withIndex("by_from", (q) => q.eq("from", a._id).eq("type", "duplicates"))
          .collect()),
        ...(await ctx.db
          .query("edges")
          .withIndex("by_from", (q) => q.eq("from", b._id).eq("type", "duplicates"))
          .collect()),
      ];
      if (marked.some((e) => e.to === a._id || e.to === b._id)) continue;
      const title = `same title? ${a.id} "${a.title}" and ${b.id} "${b.title}"`;
      if (await alreadyAsked(ctx, title)) continue;
      const blocker = await raiseBlocker(ctx, RECONCILE, a, {
        kind: "decision",
        owner: opts.owner,
        title,
        whatResolves: `drop one, mark it with cn dep add ${b.id} --duplicates ${a.id}, or resolve this saying both are wanted`,
      });
      await attachBlocker(ctx, RECONCILE, blocker, b);
      raised.push({ rule: "duplicate", blocker: ref(blocker), issues: [ref(a), ref(b)] });
    }

  // J7, an inbox item nobody has placed. Where it belongs is the judgement; the age is
  // the fact, and the age is all reconcile claims.
  if (isInbox)
    for (const issue of live) {
      if (now - issue._creationTime <= INBOX_STALE_MS) continue;
      const title = `still in the inbox: ${issue.id} "${issue.title}"`;
      if (await alreadyAsked(ctx, title)) continue;
      const blocker = await raiseBlocker(ctx, RECONCILE, issue, {
        kind: "decision",
        owner: opts.owner,
        title,
        whatResolves: `give it an epic with cn update ${issue.id} --epic ep-N --revision ${issue.revision}, or drop it with a reason`,
      });
      raised.push({ rule: "inbox-age", blocker: ref(blocker), issues: [ref(issue)] });
    }

  // J8, a blocker past the day it said to look again. The date is in the title, so the
  // question is asked once per `nudgeAt` and again when somebody moves it.
  const nudged = new Map<Id<"blockers">, Doc<"blockers">>();
  for (const issue of live)
    for (const blocker of await blockersOn(ctx, issue))
      if (blocker.nudgeAt !== undefined && blocker.nudgeAt <= now) nudged.set(blocker._id, blocker);
  for (const blocker of nudged.values()) {
    const held = await issuesHeldBy(ctx, blocker);
    const first = held[0];
    if (!first) continue;
    const day = new Date(blocker.nudgeAt!).toISOString().slice(0, 10);
    const title = `still waiting? ${blocker.id} "${blocker.title}" (nudge ${day})`;
    if (await alreadyAsked(ctx, title)) continue;
    const asked = await raiseBlocker(ctx, RECONCILE, first, {
      kind: "decision",
      owner: opts.owner,
      title,
      whatResolves: `resolve ${blocker.id} if it is done, or say it is still waited on`,
    });
    for (const issue of held.slice(1)) await attachBlocker(ctx, RECONCILE, asked, issue);
    raised.push({
      rule: "nudge",
      blocker: ref(asked),
      issues: held.map(ref),
      about: ref(blocker),
    });
  }

  // The stamp, not an edit: nobody reads an epic's revision to learn when it was last
  // tidied, and bumping it would make every held revision stale for a housekeeping run.
  await ctx.db.patch(epic._id, { lastReconciledAt: now });
  // One event for the whole run, carrying who asked for it and everything it did. A person
  // who asked by hand always gets theirs, even when nothing happened, because the answer to
  // "was this looked at" is the event. The sweep visits every open epic every day, so a row
  // per quiet epic per day is noise in the history of an epic nothing is happening to.
  if (opts.recordWhenQuiet || did.length + raised.length > 0)
    await record(ctx, {
      kind: "reconcile.run",
      actor: RECONCILE,
      epicId: epic._id,
      changes: { by: opts.by, owner: opts.owner, did, raised },
    });
  return { epic: ref(epic), at: now, did, raised };
}

export const run = mutation({
  args: { actor: actorValidator, id: v.string(), owner: v.string() },
  handler: async (ctx, args) => {
    const epic = await epicById(ctx, args.id);
    if (epic.status !== "open")
      throw invalid(`${epic.id} is ${epic.status}; reconcile works an open epic`);
    return await reconcileEpic(ctx, epic, {
      by: args.actor.name,
      owner: args.owner,
      recordWhenQuiet: true,
    });
  },
});

/** Who a swept run says asked for it, where a by-hand run names the caller. */
const SWEEP_BY = "cairn/sweep";

/**
 * The cron's entry point (crons.ts). It writes nothing itself beyond its own event: one
 * `sweepEpic` per open epic through the scheduler, so an epic that throws takes its own
 * transaction down and the rest of the sweep still lands.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ owner: string | null; epics: Ref[] }> => {
    const owner = deploymentEnv("CAIRN_OWNER");
    // The on-switch, and the only one: until a deployment says who reconcile's questions
    // are addressed to, there is nobody to raise a blocker to and the sweep does nothing.
    if (owner === undefined) {
      console.warn(
        "reconcile.sweep: CAIRN_OWNER is not set on this deployment, so the sweep is off",
      );
      return { owner: null, epics: [] };
    }

    const open = await ctx.db
      .query("epics")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    // ep-10 after ep-2, the order `cn epic list` prints.
    open.sort(issueOrder);
    for (const epic of open)
      await ctx.scheduler.runAfter(0, internal.reconcile.sweepEpic, { id: epic.id, owner });
    const epics = open.map(ref);
    // One event for the sweep, on no epic: what it did to each is that epic's own run.
    await record(ctx, { kind: "reconcile.sweep", actor: RECONCILE, changes: { owner, epics } });
    return { owner, epics };
  },
});

/** One epic's turn, in its own transaction. */
export const sweepEpic = internalMutation({
  args: { id: v.string(), owner: v.string() },
  handler: async (ctx, args) => {
    const epic = await epicById(ctx, args.id);
    // Closed between the sweep and its turn, by a person or an agent working at that hour.
    // Nothing to tidy and nothing wrong, so it leaves no trace. `run` refuses the same
    // epic, because there somebody asked and deserves to hear why.
    if (epic.status !== "open") return null;
    return await reconcileEpic(ctx, epic, {
      by: SWEEP_BY,
      owner: args.owner,
      recordWhenQuiet: false,
    });
  },
});
