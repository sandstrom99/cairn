// thresholds.ts: the numbers `review.get`, the brief and epic health measure against
// (docs/design.md §7, §12). They live here rather than beside any one reader because
// lib/health.ts reads them for what is stuck, brief.ts for a silent claim, review.ts
// for its lines and clock.ts for the next moment any of them turns: one constants module
// they all import, rather than any reading another.

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
/** A claim with no journal activity this long is shown as silent by the brief and cn review; nothing releases it (§7, §12). */
export const CLAIM_SILENT_MS = 24 * HOUR;
/** An inbox item created longer ago than this is listed by cn review (§7, §12). */
export const INBOX_STALE_MS = 7 * DAY;
/**
 * How long an open, unclaimed issue may sit silent before its epic's health names it stuck,
 * by priority: P0 a day, P1 3 days, P2 a week. P3 and P4 have no limit and are never stuck,
 * since a backlog is always quiet somewhere (§8, §12).
 */
export const STUCK_AFTER_MS: { readonly [priority: number]: number | undefined } = {
  0: DAY,
  1: 3 * DAY,
  2: 7 * DAY,
};
/** How many days a project's pulse covers, one bucket per UTC day, today included (§8). */
export const PULSE_DAYS = 28;
/**
 * A claim with nothing journaled this long, counted from the later of the claim and its
 * newest entry, is what the Stop hook hands back as one state line (§8).
 */
export const JOURNAL_QUIET_MS = 1 * HOUR;
/** A close this recent is on the brief's done line and the Overview's Moving group (§8). */
export const RECENT_MS = 48 * HOUR;

// The moments each line above starts to hold. Every comparison is strict, silent strictly
// longer than the limit, so the first millisecond a line holds is its start plus the limit
// plus one. Each rule is spelled here once, as that moment: the queries read `moment <= now`
// and `clock.next` hands the page the earliest moment still ahead, so the two cannot
// disagree about when a line appears.

/** The moment a claim reads silent: the brief's `silentSince` and review's silent line. */
export const silentAt = (lastActivity: number): number => lastActivity + CLAIM_SILENT_MS + 1;
/** The moment a claim reads quiet, `since` counted as the brief counts it: its `unjournaledSince`. */
export const quietAt = (since: number): number => since + JOURNAL_QUIET_MS + 1;
/** The moment an inbox item reads stale: review's inbox line. */
export const staleAt = (createdAt: number): number => createdAt + INBOX_STALE_MS + 1;
/** The moment a close is no longer recent: the brief's `recent` and clock.next read it. */
export const fadedAt = (closedAt: number): number => closedAt + RECENT_MS + 1;
/**
 * The moment an open, unclaimed issue nobody holds reads stuck: its deferral passed and its
 * silence past its priority's limit, or undefined for a priority that is never stuck. The
 * other conditions, open, unclaimed and held by no blocker, are not the clock's.
 */
export const stuckAt = (issue: {
  priority: number;
  lastActivity: number;
  deferUntil?: number;
}): number | undefined => {
  const limit = STUCK_AFTER_MS[issue.priority];
  return limit === undefined
    ? undefined
    : Math.max(issue.deferUntil ?? 0, issue.lastActivity + limit + 1);
};
