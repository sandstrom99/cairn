// edges.ts: the graph between issues. One direction is ever stored: `--blocked-by X` on Y
// writes the same row `--blocks Y` on X would, and `blocked-by` is that row read through
// `by_to` (docs/design.md §3). A second row for the other direction is how a graph starts
// disagreeing with itself.
//
// Only `blocks` touches readiness. `related`, `discovered-from`, `duplicates` and
// `supersedes` are context, and a cycle in them is fine; a cycle in `blocks` makes both
// ends unready forever, so `add` refuses one and names the path it found.
//
// An edge is not a mutable field: it carries no `revision`, bumps none, and stamps no
// `lastActivity`. It records `edge.add` on both endpoints, so either issue's history
// shows it; `cn log` lists the edge once, on the end that leads its sentence, which
// `events.recent` decides.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { actorValidator } from "./lib/actor";
import { invalid, notFound } from "./lib/errors";
import { record } from "./lib/events";
import { mutation } from "./lib/guard";
import { issueById } from "./lib/lookup";
import { type EdgeType, edgeTypeValidator } from "./lib/validators";
import { ref } from "./lib/views";

/** The one `(from, to, type)` row, or null. */
async function edgeBetween(
  ctx: QueryCtx,
  from: Id<"issues">,
  to: Id<"issues">,
  type: EdgeType,
): Promise<Doc<"edges"> | null> {
  const rows = await ctx.db
    .query("edges")
    .withIndex("by_from", (q) => q.eq("from", from).eq("type", type))
    .collect();
  return rows.find((e) => e.to === to) ?? null;
}

/**
 * The public ids along a `blocks` route from `start` to `goal`, or null when there is
 * none. Depth first through `by_from` with a visited set, so the walk is bounded by the
 * graph however tangled it is, and it carries the route rather than only the answer: a
 * refusal that names the cycle is actionable and one that only says "cycle" is not.
 */
async function blocksRoute(
  ctx: QueryCtx,
  start: Doc<"issues">,
  goal: Id<"issues">,
): Promise<string[] | null> {
  const seen = new Set<string>([start._id]);
  const walk = async (doc: Doc<"issues">, route: string[]): Promise<string[] | null> => {
    const out = await ctx.db
      .query("edges")
      .withIndex("by_from", (q) => q.eq("from", doc._id).eq("type", "blocks"))
      .collect();
    for (const edge of out) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      const next = await ctx.db.get(edge.to);
      if (!next) continue;
      const onward = [...route, next.id];
      if (edge.to === goal) return onward;
      const found = await walk(next, onward);
      if (found) return found;
    }
    return null;
  };
  return await walk(start, [start.id]);
}

export const add = mutation({
  args: { actor: actorValidator, from: v.string(), to: v.string(), type: edgeTypeValidator },
  handler: async (ctx, args) => {
    if (args.from === args.to) throw invalid("an issue cannot relate to itself");
    const from = await issueById(ctx, args.from);
    const to = await issueById(ctx, args.to);

    // Idempotent: the same edge asked for twice is one row, one pair of events, and a
    // re-run of a script that adds it costs nothing.
    const already = await edgeBetween(ctx, from._id, to._id, args.type);
    if (already) return { type: args.type, from: ref(from), to: ref(to) };

    if (args.type === "blocks") {
      // Walking forward from `to` rather than back from `from`: the route it finds is the
      // loop the new edge would close, in the order it would be read.
      const route = await blocksRoute(ctx, to, from._id);
      if (route) throw invalid(`${[...route, to.id].join(" → ")} would block itself`);
    }

    // A closed or dropped endpoint is allowed. A closed blocker does not block (§4), and
    // reconcile drops the edge later rather than the write refusing it now.
    await ctx.db.insert("edges", {
      from: from._id,
      to: to._id,
      type: args.type,
      by: args.actor,
    });
    const changes = { type: args.type, from: from.id, to: to.id };
    for (const issueId of [from._id, to._id])
      await record(ctx, { kind: "edge.add", actor: args.actor, issueId, changes });
    return { type: args.type, from: ref(from), to: ref(to) };
  },
});

export const remove = mutation({
  args: { actor: actorValidator, from: v.string(), to: v.string(), type: edgeTypeValidator },
  handler: async (ctx, args) => {
    const from = await issueById(ctx, args.from);
    const to = await issueById(ctx, args.to);
    const edge = await edgeBetween(ctx, from._id, to._id, args.type);
    if (!edge) throw notFound(`${args.from} ${args.type} ${args.to}`);

    await ctx.db.delete(edge._id);
    const changes = { type: args.type, from: from.id, to: to.id };
    for (const issueId of [from._id, to._id])
      await record(ctx, { kind: "edge.remove", actor: args.actor, issueId, changes });
    return { type: args.type, from: ref(from), to: ref(to) };
  },
});
