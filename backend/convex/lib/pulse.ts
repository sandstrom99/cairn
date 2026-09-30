// pulse.ts: the read side of a project's pulse (docs/design.md §8), and the day arithmetic
// the write side shares. The count itself is kept by lib/events.ts, in the transaction that
// writes each event, one `pulse` row per project per UTC day; this reads the last
// PULSE_DAYS of those rows back as buckets. It imports nothing from events.ts, which imports
// `dayOf` from here, so the two cannot form a cycle.
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { DAY, PULSE_DAYS } from "./thresholds";

/** One bucket of a pulse: the events that touched a project's issues, and the closes among them. */
export type PulseDay = { events: number; closes: number };

/** The UTC day a moment falls on, as the `pulse` table keys it. */
export const dayOf = (ms: number): number => Math.floor(ms / DAY);

/** A pulse with nothing in it: PULSE_DAYS quiet days. */
export const emptyPulse = (): PulseDay[] =>
  Array.from({ length: PULSE_DAYS }, () => ({ events: 0, closes: 0 }));

/**
 * Each project's pulse (§8): for each of the last PULSE_DAYS UTC days, oldest first, how many
 * events touched its issues and how many of those were closes, the last bucket being today
 * so far. Every id passed gets all PULSE_DAYS buckets, zeros included.
 *
 * A day is a UTC calendar day because a bucket that never moves once its day is over can be
 * stored, and so read as a handful of small rows; a day counted back from the caller's clock
 * moved with every read, and had to be recounted from every event of the window each time.
 */
export async function pulses(
  ctx: QueryCtx,
  projectIds: Id<"projects">[],
  now: number,
): Promise<Map<Id<"projects">, PulseDay[]>> {
  const today = dayOf(now);
  const out = new Map<Id<"projects">, PulseDay[]>();
  for (const id of projectIds) {
    const rows = await ctx.db
      .query("pulse")
      .withIndex("by_project_day", (q) =>
        q
          .eq("projectId", id)
          .gte("day", today - (PULSE_DAYS - 1))
          .lte("day", today),
      )
      .collect();
    const pulse = emptyPulse();
    for (const row of rows)
      pulse[PULSE_DAYS - 1 - (today - row.day)] = { events: row.events, closes: row.closes };
    out.set(id, pulse);
  }
  return out;
}
