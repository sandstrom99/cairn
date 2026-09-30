// now.ts: the display clock, in whole minutes, for "3m ago" and every other age the page
// prints. It re-renders the page once a minute and asks the deployment nothing: the clock the
// queries carry is `useClock` in deployment.ts, which moves only when `clock.next` says a line
// would change, and `tick` below is the decision it takes on every answer, a pure function so
// the suite can drive it with no renderer.
import { useEffect, useState } from "react";

export const MINUTE = 60_000;

/** `ms` rounded down to the minute: the display clock's reading. */
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

/** The longest delay `setTimeout` takes before it fires at once instead: 2^31 - 1 ms. */
export const MAX_DELAY = 2 ** 31 - 1;

/**
 * What to do about the deployment's next moment, given the clock the page sent and the time now.
 *
 * Nothing while there is no answer, while the tab is hidden, or when the answer is not after
 * the clock it was sent: that last means the deployment's clock is behind this browser's, and
 * advancing on it would ask again at once, forever, so the page waits for the next write
 * instead. A moment already reached advances the clock now; one still ahead is a delay to
 * wait. The moment is at most a day off, since midnight is always a candidate, but the clamp
 * to MAX_DELAY costs nothing.
 */
export const tick = (
  next: number | undefined,
  sent: number,
  at: number,
  visible: boolean,
): { advance: true } | { delay: number } | undefined => {
  if (next === undefined || !visible || next <= sent) return undefined;
  if (next <= at) return { advance: true };
  return { delay: Math.min(next - at, MAX_DELAY) };
};
