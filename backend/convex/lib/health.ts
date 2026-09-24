// health.ts: the health line of docs/design.md §8 — what is moving, what is stuck, what
// waits on a person — each a fact with a query behind it and never a percentage. It lives
// here rather than in views.ts because it is a computation over an epic's issues, not the
// shape of one document.
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { unresolvedBlockersOn } from "./graph";
import { idOrder } from "./order";
import { STUCK_AFTER_MS } from "./thresholds";
import { isLive } from "./validators";
import { epicView } from "./views";

/**
 * The one issue of an epic that is stuck, or none: open, unclaimed, not deferred, silent
 * longest, and only once that silence passes STUCK_AFTER_MS. The rule lives here alone, so
 * the epic's health line and an issue's own state (`show.get`) name the same issue.
 */
export function stuckOf(issues: Doc<"issues">[], now: number): Doc<"issues"> | undefined {
  const idle = issues.filter(
    (i) =>
      i.status === "open" &&
      i.claimedBy === undefined &&
      (i.deferUntil === undefined || i.deferUntil <= now),
  );
  const silent = idle.reduce<Doc<"issues"> | undefined>(
    (worst, i) => (worst === undefined || i.lastActivity < worst.lastActivity ? i : worst),
    undefined,
  );
  return silent !== undefined && now - silent.lastActivity > STUCK_AFTER_MS ? silent : undefined;
}

/**
 * The epic view, plus the three lines of design §8: what is moving, what is stuck, what
 * waits on a person. Not a percentage — an epic at 95% frozen for a month reads better
 * than one at 40% advancing daily, so each line is a fact with a query behind it.
 *
 * `stuck` is the single open, unclaimed, undeferred issue that has been silent longest,
 * and only once that silence passes STUCK_AFTER_MS: an epic nobody has neglected has no
 * stuck line at all.
 *
 * `now` is the caller's clock when a subscriber sends one, because a subscription re-runs
 * on data and never on time.
 *
 * It takes the epic's issues preloaded, so a caller that already holds them (`show.get`,
 * `epics.list`) reads them once.
 *
 * `lastActivity` is the newest write to the epic or to any issue under it, as the issues
 * stamp it, so an edge or a blocker on its own moves nothing; the overview sorts by it.
 */
export async function epicHealth(
  ctx: QueryCtx,
  doc: Doc<"epics">,
  issues: Doc<"issues">[],
  now: number = Date.now(),
) {
  const moving = issues
    .filter((i) => i.status === "in_progress")
    .map((i) => ({
      id: i.id,
      title: i.title,
      claimedBy: i.claimedBy!,
      claimedAt: i.claimedAt ?? i.lastActivity,
    }))
    .sort((a, b) => a.claimedAt - b.claimedAt);

  const neglected = stuckOf(issues, now);
  const stuck = neglected
    ? { id: neglected.id, title: neglected.title, lastActivity: neglected.lastActivity }
    : undefined;

  // One blocker can hold several of the epic's issues, and it is one waiting line either
  // way, so the walk over blockerLinks deduplicates by blocker.
  const live = issues.filter(isLive);
  const seen = new Set<string>();
  const waiting: { id: string; title: string; owner: string }[] = [];
  for (const issue of live) {
    for (const blocker of await unresolvedBlockersOn(ctx, issue._id)) {
      if (seen.has(blocker._id)) continue;
      seen.add(blocker._id);
      waiting.push({ id: blocker.id, title: blocker.title, owner: blocker.owner });
    }
  }
  waiting.sort(idOrder);

  // The newest write to the epic or to anything under it, as the issues themselves stamp
  // it: a create, a claim, a close, an edit, a journal entry. An edge or a blocker stamps
  // nothing (edges.ts), which is the notion of activity the stuck line already measures
  // against. The epic's own events are its create, close or drop, which the index holds
  // beside each issue.create under it, read newest first. `_creationTime` carries a
  // fraction of a millisecond to order writes inside one; the floor makes it whole
  // milliseconds, as `Date.now()` stamps an issue's `lastActivity`.
  const own = await ctx.db
    .query("events")
    .withIndex("by_epic", (q) => q.eq("epicId", doc._id))
    .order("desc")
    .first();
  const lastActivity = Math.max(
    Math.floor(own?._creationTime ?? doc._creationTime),
    ...issues.map((i) => i.lastActivity),
  );

  return { ...epicView(doc, issues), lastActivity, health: { moving, stuck, waiting } };
}
