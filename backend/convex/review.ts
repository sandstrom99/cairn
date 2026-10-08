// review.ts: the sitting of docs/design.md §7. `get` is one query over one epic that lists
// what a person and an agent should look at together, and it writes nothing: no record, no
// patch, no insert. Nothing it returns is consumed by returning it, so running it twice
// reads the same.
//
// Every line is a fact — two titles that read as the same work, an inbox item past its
// age, a blocker past its nudge, a claim gone silent, an unverified close with nothing
// beside it, a `blocks` edge with one end finished and one live, an open outcome with no
// done-when, an outcome whose every task is finished — and the judgement is left to the
// two reading it, through the verbs that exist, each in the log under its own name. The
// thresholds are lib/thresholds.ts and lib/titles.ts, the numbers the brief, epic health
// and `issues.create` read too.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { nowArg } from "./lib/clock";
import {
  edgesFrom,
  edgesTo,
  hasChild,
  issuesHeldBy,
  issuesIn,
  unresolvedBlockersOn,
} from "./lib/graph";
import { query } from "./lib/guard";
import { INBOX_ID } from "./lib/inbox";
import { epicById } from "./lib/lookup";
import { idOrder } from "./lib/order";
import { silentAt, staleAt } from "./lib/thresholds";
import { nearIdentical } from "./lib/titles";
import { epicFinished, epicTypeOf, isLive } from "./lib/validators";
import { type End, type Ref, end, epicView, ref } from "./lib/views";

export const get = query({
  args: { id: v.string(), ...nowArg },
  handler: async (ctx, { id, now = Date.now() }) => {
    // Any status: a closed epic reviews to nothing, it is not refused.
    const epic = await epicById(ctx, id);
    const issues = await issuesIn(ctx, epic._id);
    const live = issues.filter(isLive).sort(idOrder);
    const byId = new Map(issues.map((doc) => [doc._id, doc]));

    // Two live issues that read as the same work. A `duplicates` edge between them, in
    // either direction, is the answer already given.
    const near: { a: Ref; b: Ref }[] = [];
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]!;
        const b = live[j]!;
        if (!nearIdentical(a.title, b.title)) continue;
        const marked = [
          ...(await edgesFrom(ctx, a._id, "duplicates")).filter((e) => e.to === b._id),
          ...(await edgesFrom(ctx, b._id, "duplicates")).filter((e) => e.to === a._id),
        ];
        if (marked.length === 0) near.push({ a: ref(a), b: ref(b) });
      }

    // An inbox item nobody has placed: the age is the fact, where it belongs the judgement.
    const inbox =
      epic.id === INBOX_ID
        ? live
            .filter((doc) => staleAt(doc._creationTime) <= now)
            .map((doc) => ({ id: doc.id, title: doc.title, createdAt: doc._creationTime }))
        : [];

    // A blocker past the day it said to look again, with the live issues it holds.
    const nudged = new Map<Id<"blockers">, Doc<"blockers">>();
    for (const doc of live)
      for (const blocker of await unresolvedBlockersOn(ctx, doc._id))
        if (blocker.nudgeAt !== undefined && blocker.nudgeAt <= now)
          nudged.set(blocker._id, blocker);
    const nudges: { id: string; title: string; owner: string; nudgeAt: number; holds: Ref[] }[] =
      [];
    for (const blocker of [...nudged.values()].sort(idOrder))
      nudges.push({
        id: blocker.id,
        title: blocker.title,
        owner: blocker.owner,
        nudgeAt: blocker.nudgeAt!,
        holds: (await issuesHeldBy(ctx, blocker._id)).filter(isLive).sort(idOrder).map(ref),
      });

    // A claim with no activity past the brief's threshold. Nothing releases it; a person does.
    const silent = issues
      .filter((doc) => doc.status === "in_progress" && silentAt(doc.lastActivity) <= now)
      .sort(idOrder)
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        // An in-progress issue always carries its claimant (lib/lifecycle.ts, claimIssue).
        claimedBy: doc.claimedBy!,
        lastActivity: doc.lastActivity,
      }));

    // A close marked unverified with no child beside it, of any status: a dropped one was
    // a decision. Rows written before `issues.close` spawned the follow-up itself.
    const unverified: { id: string; title: string; closedAt: number; reason: string }[] = [];
    for (const doc of [...issues].sort(idOrder)) {
      const proof = doc.verification;
      if (doc.status !== "closed" || !proof || !("unverified" in proof)) continue;
      if (await hasChild(ctx, doc._id)) continue;
      unverified.push({
        id: doc.id,
        title: doc.title,
        closedAt: doc.closedAt ?? doc.lastActivity,
        reason: proof.unverified,
      });
    }

    // A `blocks` edge with one end finished and the other live. It holds nothing (§4) and
    // stays as history; the line says it is there. An edge whose two ends are both finished
    // is history with nothing left to decide, so it is no line, and a finished epic can read
    // nothing to look at.
    const seen = new Set<Id<"edges">>();
    const edges: { from: End; to: End }[] = [];
    for (const doc of issues)
      for (const edge of [
        ...(await edgesFrom(ctx, doc._id, "blocks")),
        ...(await edgesTo(ctx, doc._id, "blocks")),
      ]) {
        if (seen.has(edge._id)) continue;
        seen.add(edge._id);
        const from = byId.get(edge.from) ?? (await ctx.db.get(edge.from));
        const to = byId.get(edge.to) ?? (await ctx.db.get(edge.to));
        if (!from || !to || isLive(from) === isLive(to)) continue;
        edges.push({ from: end(from), to: end(to) });
      }
    edges.sort((x, y) => idOrder(x.from, y.from) || idOrder(x.to, y.to));

    // A stream never closes, so only an outcome is offered its close or asked for its line.
    const outcome = epicTypeOf(epic) === "outcome";
    const open = epic.status === "open" && epic.id !== INBOX_ID;
    return {
      epic: epicView(epic, issues, now),
      canClose: open && outcome && epicFinished(issues),
      needsDoneWhen: open && outcome && !epic.doneWhen,
      near,
      inbox,
      nudges,
      silent,
      unverified,
      edges,
    };
  },
});
