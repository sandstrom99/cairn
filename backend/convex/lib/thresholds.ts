// thresholds.ts: the numbers reconcile and epic health both measure against
// (docs/design.md §7, §12). They live here rather than at the top of reconcile.ts because
// lib/views.ts reads them for the stuck line and reconcile.ts reads views.ts back: one
// constants module both import is the shape that has no cycle in it.

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
/** A claim with no journal activity this long is released (§7, §12). */
export const CLAIM_SILENT_MS = 24 * HOUR;
/** An inbox item created longer ago than this is raised to a person (§7, §12). */
export const INBOX_STALE_MS = 7 * DAY;
/** An epic's stuck line shows its open, unclaimed issue silent longer than this (§8, §12). */
export const STUCK_AFTER_MS = 3 * DAY;
/** Two open titles within this Levenshtein distance after normalisation are near-identical (§7). */
export const NEAR_TITLE_DISTANCE = 2;
/**
 * A claim with nothing journaled this long, counted from the later of the claim and its
 * newest entry, is what the Stop hook hands back as one state line (§8).
 */
export const JOURNAL_QUIET_MS = 1 * HOUR;
