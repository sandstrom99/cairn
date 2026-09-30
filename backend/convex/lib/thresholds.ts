// thresholds.ts: the numbers `review.get`, the brief and epic health measure against
// (docs/design.md §7, §12). They live here rather than beside any one reader because
// lib/health.ts reads them for what is stuck, brief.ts for a silent claim and review.ts
// for its lines: one constants module they all import, rather than any reading another.

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
