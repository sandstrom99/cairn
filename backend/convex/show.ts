// show.ts: one id in, the thing and its neighbourhood out. The prefix decides which:
// `ep-` an epic, `bl-` a blocker, anything else an issue. One function rather than
// three, because an agent holding `app-14` should not have to know which table it is in.
//
// An issue comes back with what it blocks, what blocks it, what it waits on, its parent
// and its follow-ups (docs/design.md §3), and with `history` its events as well. Each
// edge type is its own list, because they mean different things: `blocks` decides
// readiness and the rest are context.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { notFound } from "./lib/errors";
import { query } from "./lib/guard";
import { epicById } from "./lib/lookup";
import { type Ref, blockerView, epicHealth, issueView, ref } from "./lib/views";

const refsOf = async (ctx: QueryCtx, ids: Id<"issues">[]): Promise<Ref[]> => {
  const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return docs.filter((d): d is Doc<"issues"> => d !== null).map(ref);
};

/** Every event on an issue, oldest first: what changed, who changed it and when. */
async function history(ctx: QueryCtx, doc: Doc<"issues">) {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_issue", (q) => q.eq("issueId", doc._id))
    .collect();
  // The index orders by revision, and an append carries none, so time is the order here.
  rows.sort((a, b) => a._creationTime - b._creationTime);
  return rows.map((e) => ({
    at: e._creationTime,
    actor: e.actor,
    kind: e.kind,
    revision: e.revision,
    changes: e.changes,
  }));
}

async function issue(ctx: QueryCtx, doc: Doc<"issues">, withHistory: boolean) {
  const view = await issueView(ctx, doc);
  const entries = await ctx.db
    .query("journal")
    .withIndex("by_issue", (q) => q.eq("issueId", doc._id))
    .order("desc")
    .take(5);
  const outgoing = await ctx.db
    .query("edges")
    .withIndex("by_from", (q) => q.eq("from", doc._id))
    .collect();
  const incoming = await ctx.db
    .query("edges")
    .withIndex("by_to", (q) => q.eq("to", doc._id))
    .collect();
  const links = await ctx.db
    .query("blockerLinks")
    .withIndex("by_issue", (q) => q.eq("issueId", doc._id))
    .collect();
  const blockers = await Promise.all(links.map((l) => ctx.db.get(l.blockerId)));
  const followUps = await ctx.db
    .query("issues")
    .withIndex("by_parent", (q) => q.eq("parentIssueId", doc._id))
    .collect();

  return {
    kind: "issue" as const,
    ...view,
    journal: entries.map((e) => ({
      author: e.author,
      kind: e.kind,
      body: e.body,
      at: e._creationTime,
    })),
    blocks: await refsOf(
      ctx,
      outgoing.filter((e) => e.type === "blocks").map((e) => e.to),
    ),
    blockedBy: await refsOf(
      ctx,
      incoming.filter((e) => e.type === "blocks").map((e) => e.from),
    ),
    // `related` is symmetric, so it reads both ways; the other three name a direction
    // and are the edges from this issue, the way `cn dep add` wrote them.
    related: await refsOf(ctx, [
      ...outgoing.filter((e) => e.type === "related").map((e) => e.to),
      ...incoming.filter((e) => e.type === "related").map((e) => e.from),
    ]),
    discoveredFrom: await refsOf(
      ctx,
      outgoing.filter((e) => e.type === "discovered-from").map((e) => e.to),
    ),
    duplicates: await refsOf(
      ctx,
      outgoing.filter((e) => e.type === "duplicates").map((e) => e.to),
    ),
    supersedes: await refsOf(
      ctx,
      outgoing.filter((e) => e.type === "supersedes").map((e) => e.to),
    ),
    waitingOn: blockers
      .filter((b): b is Doc<"blockers"> => b !== null && b.status !== "resolved")
      .map(ref),
    followUps: followUps.map(ref),
    events: withHistory ? await history(ctx, doc) : undefined,
  };
}

async function epic(ctx: QueryCtx, doc: Doc<"epics">) {
  const rows = await ctx.db
    .query("issues")
    .withIndex("by_epic", (q) => q.eq("epicId", doc._id))
    .collect();
  const live = rows.filter((i) => i.status === "open" || i.status === "in_progress");
  live.sort((a, b) => a.priority - b.priority || a._creationTime - b._creationTime);
  return {
    kind: "epic" as const,
    ...(await epicHealth(ctx, doc)),
    issues: live.map((i) => ({ id: i.id, title: i.title, status: i.status, priority: i.priority })),
  };
}

async function blocker(ctx: QueryCtx, doc: Doc<"blockers">, withHistory: boolean) {
  const events = await ctx.db
    .query("events")
    .withIndex("by_blocker", (q) => q.eq("blockerId", doc._id))
    .collect();
  events.sort((a, b) => a._creationTime - b._creationTime);
  return {
    kind: "blocker" as const,
    ...(await blockerView(ctx, doc)),
    events: withHistory
      ? events.map((e) => ({
          at: e._creationTime,
          actor: e.actor,
          kind: e.kind,
          revision: e.revision,
          changes: e.changes,
        }))
      : undefined,
  };
}

export const get = query({
  args: { id: v.string(), history: v.optional(v.boolean()) },
  handler: async (ctx, { id, history: withHistory }) => {
    if (id.startsWith("ep-")) return await epic(ctx, await epicById(ctx, id));
    if (id.startsWith("bl-")) {
      const doc = await ctx.db
        .query("blockers")
        .withIndex("by_public_id", (q) => q.eq("id", id))
        .unique();
      if (!doc) throw notFound(id);
      return await blocker(ctx, doc, Boolean(withHistory));
    }
    const doc = await ctx.db
      .query("issues")
      .withIndex("by_public_id", (q) => q.eq("id", id))
      .unique();
    if (!doc) throw notFound(id);
    return await issue(ctx, doc, Boolean(withHistory));
  },
});
