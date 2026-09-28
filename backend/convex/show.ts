// show.ts: one id in, the thing and its neighbourhood out. The prefix decides which:
// `ep-` an epic, `bl-` a blocker, anything else an issue. One function rather than
// three, because an agent holding `app-14` should not have to know which table it is in.
//
// An issue comes back with what it blocks, what blocks it, what it waits on, its parent
// and its follow-ups (docs/design.md §3), and with `history` its events as well. Each
// edge type is its own list, because they mean different things: `blocks` decides
// readiness and the rest are context. Every issue the neighbourhood names carries its
// status, because a finished one is history or finished work, never live (§7): a `blocks`
// edge into a finished issue holds nothing back and stays, and a dropped follow-up is not
// work left. `stuck` is the epic's own stuck line pointing at this issue, so `cn show` and
// the page say it from the one rule.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { nowArg } from "./lib/clock";
import { invalid } from "./lib/errors";
import {
  edgesFrom,
  edgesTo,
  eventView,
  eventsOn,
  issuesIn,
  unresolvedBlockersOn,
} from "./lib/graph";
import { query } from "./lib/guard";
import { epicHealth, stuckOf } from "./lib/health";
import { JOURNAL_HEAD, JOURNAL_MAX } from "./lib/limits";
import { blockerById, epicById, issueById } from "./lib/lookup";
import { priorityOrder } from "./lib/order";
import { isLive } from "./lib/validators";
import { type End, blockerView, end, issueView, ref } from "./lib/views";

const docsOf = async (ctx: QueryCtx, ids: Id<"issues">[]): Promise<Doc<"issues">[]> => {
  const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return docs.filter((d): d is Doc<"issues"> => d !== null);
};

/**
 * The issues at the far end of an edge, each with its status: a finished one reads as
 * finished, not as live.
 */
const endsOf = async (ctx: QueryCtx, ids: Id<"issues">[]): Promise<End[]> =>
  (await docsOf(ctx, ids)).map(end);

/** Every event on an issue, oldest first: what changed, who changed it and when. */
async function history(ctx: QueryCtx, doc: Doc<"issues">) {
  return (await eventsOn(ctx, { table: "issues", doc })).map(eventView);
}

async function issue(
  ctx: QueryCtx,
  doc: Doc<"issues">,
  withHistory: boolean,
  head: number,
  now?: number,
) {
  const view = await issueView(ctx, doc);
  const siblings = await issuesIn(ctx, doc.epicId);
  const entries = await ctx.db
    .query("journal")
    .withIndex("by_issue", (q) => q.eq("issueId", doc._id))
    .order("desc")
    .take(head);
  const outgoing = await edgesFrom(ctx, doc._id);
  const incoming = await edgesTo(ctx, doc._id);
  const followUps = await ctx.db
    .query("issues")
    .withIndex("by_parent", (q) => q.eq("parentIssueId", doc._id))
    .collect();

  return {
    kind: "issue" as const,
    ...view,
    stuck: stuckOf(siblings, now ?? Date.now())?._id === doc._id,
    journal: entries.map((e) => ({
      author: e.author,
      kind: e.kind,
      body: e.body,
      at: e._creationTime,
    })),
    blocks: await endsOf(
      ctx,
      outgoing.filter((e) => e.type === "blocks").map((e) => e.to),
    ),
    blockedBy: await endsOf(
      ctx,
      incoming.filter((e) => e.type === "blocks").map((e) => e.from),
    ),
    // `related` is symmetric, so it reads both ways; the other three name a direction
    // and are the edges from this issue, the way `cn dep add` wrote them.
    related: await endsOf(ctx, [
      ...outgoing.filter((e) => e.type === "related").map((e) => e.to),
      ...incoming.filter((e) => e.type === "related").map((e) => e.from),
    ]),
    discoveredFrom: await endsOf(
      ctx,
      outgoing.filter((e) => e.type === "discovered-from").map((e) => e.to),
    ),
    duplicates: await endsOf(
      ctx,
      outgoing.filter((e) => e.type === "duplicates").map((e) => e.to),
    ),
    supersedes: await endsOf(
      ctx,
      outgoing.filter((e) => e.type === "supersedes").map((e) => e.to),
    ),
    waitingOn: (await unresolvedBlockersOn(ctx, doc._id)).map(ref),
    followUps: followUps.map(end),
    events: withHistory ? await history(ctx, doc) : undefined,
  };
}

async function epic(ctx: QueryCtx, doc: Doc<"epics">, now?: number) {
  const rows = await issuesIn(ctx, doc._id);
  const live = rows.filter(isLive);
  live.sort(priorityOrder);
  return {
    kind: "epic" as const,
    ...(await epicHealth(ctx, doc, rows, now)),
    issues: live.map((i) => ({ id: i.id, title: i.title, status: i.status, priority: i.priority })),
  };
}

async function blocker(ctx: QueryCtx, doc: Doc<"blockers">, withHistory: boolean) {
  return {
    kind: "blocker" as const,
    ...(await blockerView(ctx, doc)),
    events: withHistory
      ? (await eventsOn(ctx, { table: "blockers", doc })).map(eventView)
      : undefined,
  };
}

export const get = query({
  args: {
    id: v.string(),
    history: v.optional(v.boolean()),
    journal: v.optional(v.number()),
    ...nowArg,
  },
  handler: async (ctx, { id, history: withHistory, journal = JOURNAL_HEAD, now }) => {
    if (!Number.isInteger(journal) || journal < 1 || journal > JOURNAL_MAX)
      throw invalid(`journal is a whole number from 1 to ${JOURNAL_MAX}, not ${journal}`);
    if (id.startsWith("ep-")) return await epic(ctx, await epicById(ctx, id), now);
    if (id.startsWith("bl-"))
      return await blocker(ctx, await blockerById(ctx, id), Boolean(withHistory));
    return await issue(ctx, await issueById(ctx, id), Boolean(withHistory), journal, now);
  },
});
