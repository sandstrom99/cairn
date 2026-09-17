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
//
// The computation is `readyIssues` in lib/readiness.ts rather than here, because
// `brief.get` counts and heads the same rows and must never disagree with this list.
import { v } from "convex/values";
import { query } from "./lib/guard";
import { readyIssues } from "./lib/readiness";

export const list = query({
  args: { can: v.optional(v.array(v.string())) },
  handler: async (ctx, { can }) => await readyIssues(ctx, can),
});
