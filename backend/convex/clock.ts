// clock.ts: the page's timer (docs/design.md §10, "A subscriber sends the clock it loaded
// with"). A subscription re-runs on data and never on time, so a page sends its queries the
// clock it loaded with and asks this for the earliest moment after that clock at which any
// line those queries draw from the clock would change with no write: an issue turning stuck,
// a claim turning silent or quiet, a deferral passing, a blocker's nudge date, an inbox item
// turning stale, or the next UTC midnight, when the pulse's buckets roll. It sets one timer
// for that moment and moves its clock to the present when it fires, so a tab left open
// re-asks a few times a day rather than once a minute.
//
// It is conservative: the answer is a moment at which a line *may* change. An issue a
// blocker holds still has its stuck moment counted, and the page reruns and sees nothing
// new, which costs one rerun; a moment left out would cost a line that never appears. Every
// moment is the one lib/thresholds.ts spells for the predicate that draws the line, so the
// two cannot disagree.
//
// It reads the open and in-progress issues through `by_status`, the raised and waiting
// blockers through `by_status`, the inbox epic, and the newest journal entry of each
// in-progress issue through `by_issue`, the way the brief reads it; and nothing else, so a
// write that moves none of those leaves the page's timer where it was.
import { nowArg } from "./lib/clock";
import { query } from "./lib/guard";
import { INBOX_ID } from "./lib/inbox";
import { lastJournaledAt } from "./lib/journal";
import { findEpic } from "./lib/lookup";
import { dayOf } from "./lib/pulse";
import { DAY, quietAt, silentAt, staleAt, stuckAt } from "./lib/thresholds";

/**
 * The earliest moment after `now` at which a clock-driven line may change with no write, in
 * whole milliseconds. The next UTC midnight is always a candidate, so there is always an
 * answer, and it is never more than a day away.
 */
export const next = query({
  args: { ...nowArg },
  handler: async (ctx, { now = Date.now() }): Promise<number> => {
    // The next UTC midnight, when the pulse's buckets roll, first: always there.
    const moments = [(dayOf(now) + 1) * DAY];

    const open = await ctx.db
      .query("issues")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const inbox = await findEpic(ctx, INBOX_ID);
    for (const issue of open) {
      // Its stuck moment already folds in the deferral; the deferral on its own is when the
      // ready list and `blockedBy` flip.
      const stuck = stuckAt(issue);
      if (stuck !== undefined) moments.push(stuck);
      if (issue.deferUntil !== undefined) moments.push(issue.deferUntil);
      if (inbox !== null && issue.epicId === inbox._id) moments.push(staleAt(issue._creationTime));
    }

    const inProgress = await ctx.db
      .query("issues")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();
    for (const issue of inProgress) {
      moments.push(silentAt(issue.lastActivity));
      moments.push(quietAt((await lastJournaledAt(ctx, issue)).since));
    }

    for (const status of ["raised", "waiting"] as const) {
      const blockers = await ctx.db
        .query("blockers")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const blocker of blockers)
        if (blocker.nudgeAt !== undefined) moments.push(blocker.nudgeAt);
    }

    // `_creationTime` carries a fraction of a millisecond, and the page's clock is whole
    // milliseconds that must land at or after the moment, never a hair before it.
    return Math.ceil(Math.min(...moments.filter((moment) => moment > now)));
  },
});
