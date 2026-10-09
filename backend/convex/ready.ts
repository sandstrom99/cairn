// ready.ts: the one genuinely hard query, computed live (docs/design.md §4).
//
//   ready = status open
//           AND no open `blocks` edge into it
//           AND no unresolved blocker attached
//           AND (deferUntil is null OR deferUntil <= now)
//         ordered by priority, then age, the rows the stuck rule names after the rest
//
// No `isReady` column and no recompute step: the moment a blocker closes, the issue it
// held is ready, with nothing run in between. beads spends ~2,000 lines here, ~800 of
// them repairing a denormalised flag after a merge — a category that does not exist on
// one authoritative deployment.
//
// `in_progress` is somebody's claim, not ready work, so the candidates are `open` alone.
// Nothing is filtered by who is asking: what a machine can do is said in an issue's own
// text, never declared to cairn (§5).
//
// The computation is `readyIssues` in lib/readiness.ts rather than here, because
// `brief.get` counts and heads the same rows and must never disagree with this list.
import { nowArg } from "./lib/clock";
import { query } from "./lib/guard";
import { readyIssues } from "./lib/readiness";

export const list = query({
  args: { ...nowArg },
  handler: async (ctx, { now }) => await readyIssues(ctx, now),
});
