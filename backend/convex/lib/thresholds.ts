// thresholds.ts: the numbers `review.get`, the brief and epic health measure against
// (docs/design.md §7, §12). They live here rather than beside any one reader because
// lib/health.ts reads them for the stuck line, brief.ts for a silent claim and review.ts
// for its lines: one constants module they all import, rather than any reading another.

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
/** A claim with no journal activity this long is shown as silent by the brief and cn review; nothing releases it (§7, §12). */
export const CLAIM_SILENT_MS = 24 * HOUR;
/** An inbox item created longer ago than this is listed by cn review (§7, §12). */
export const INBOX_STALE_MS = 7 * DAY;
/** An epic's stuck line shows its open, unclaimed issue silent longer than this (§8, §12). */
export const STUCK_AFTER_MS = 3 * DAY;
/**
 * A claim with nothing journaled this long, counted from the later of the claim and its
 * newest entry, is what the Stop hook hands back as one state line (§8).
 */
export const JOURNAL_QUIET_MS = 1 * HOUR;
