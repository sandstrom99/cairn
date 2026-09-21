// now.ts: the page's clock, in whole minutes. A `convex/react` subscription re-runs a
// query only when the data it read changes, never because time passed, so a page left
// open would never see an issue cross a threshold measured in days on its own (see
// backend/convex/lib/clock.ts) — it sends its own clock instead. Whole minutes because
// every distinct `now` is a distinct query to Convex: a minute is fine-grained enough for
// thresholds measured in days and coarse enough that the cache holds between ticks.
import { useEffect, useState } from "react";

export const MINUTE = 60_000;

/** `ms` rounded down to the minute: the `now` a live query is sent. */
export const floorToMinute = (ms: number): number => Math.floor(ms / MINUTE) * MINUTE;

/** The current minute, re-rendering the caller when the next one starts. */
export function useMinute(): number {
  const [minute, setMinute] = useState(() => floorToMinute(Date.now()));

  useEffect(() => {
    // A setTimeout per tick rather than setInterval, so a throttled background tab
    // catches up to the right minute instead of drifting.
    const delay = Math.max(0, minute + MINUTE - Date.now());
    // Never the same minute twice: a timer that fires a millisecond early, or a system
    // clock stepped back, would set the state it already holds, React would skip the
    // render, this effect would not re-arm and the page's clock would stop for good.
    const timeout = setTimeout(
      () => setMinute((held) => Math.max(floorToMinute(Date.now()), held + MINUTE)),
      delay,
    );
    return () => clearTimeout(timeout);
  }, [minute]);

  return minute;
}
