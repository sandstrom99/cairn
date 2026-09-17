// ready.ts: the one genuinely hard query, computed live (docs/design.md §4).
//
//   ready(can) = status open
//                AND no open `blocks` edge into it
//                AND no unresolved blocker attached
//                AND (deferUntil is null OR deferUntil <= now)
//              ordered by priority, then age
//              each row marked with any requires[] this session cannot satisfy
//
// No `isReady` column and no recompute step: the moment a blocker closes, the issue it
// held is ready, with nothing run in between. beads spends ~2,000 lines here, ~800 of
// them repairing a denormalised flag after a merge — a category that does not exist on
// one authoritative deployment.
//
// `in_progress` is somebody's claim, not ready work, so the candidates are `open` alone.
// **Nothing is ever filtered by capability.** A row this session cannot finish comes back
// marked `cannot`, because a wrong `can[]` hiding work is the beads bug this design
// exists to avoid (§5).
import { v } from "convex/values";
import { query } from "./_generated/server";
import { blockedBy, isReady } from "./lib/readiness";
import { issueView } from "./lib/views";

export const list = query({
  args: { can: v.optional(v.array(v.string())) },
  handler: async (ctx, { can }) => {
    const now = Date.now();
    const open = await ctx.db
      .query("issues")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    const ready = [];
    for (const doc of open) if (isReady(await blockedBy(ctx, doc, now))) ready.push(doc);
    ready.sort((a, b) => a.priority - b.priority || a._creationTime - b._creationTime);

    const have = new Set(can ?? []);
    return await Promise.all(
      ready.map(async (doc) => ({
        ...(await issueView(ctx, doc)),
        cannot: doc.requires.filter((r) => !have.has(r)),
      })),
    );
  },
});
