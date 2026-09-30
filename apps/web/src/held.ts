// held.ts: the last answer a live query gave, while the next one is on its way.
//
// `useQuery` answers `undefined` whenever its arguments change, until the deployment
// replies. The page changes the `now` its queries carry whenever `clock.next` says a line
// would change, a few times a day (`useClock`, deployment.ts), so without this every list on
// it would blink to "loading…" at each of those moments and back. Holding the previous
// answer across that gap is the pattern Convex documents as a stable query: `undefined` still
// means the first answer has not arrived, and never that a later one is pending. The lists
// hold across a `now` change with `useHeld`; the page for one id holds across an id change with
// `useStale`, which keeps the previous id's answer on screen, marked stale, until its own lands.
import { useRef } from "react";

/** The last answer, across the gap before the next: for a list whose arguments only tick. */
export function useHeld<T>(fresh: T | undefined): T | undefined {
  const held = useRef<T | undefined>(fresh);
  if (fresh !== undefined) held.current = fresh;
  return held.current;
}

/** What a hook holds: the last answer, and the key it came under; no key is nothing held. */
export type Held<T> = { key: string | undefined; value: T | undefined };

/**
 * The next held state. A fresh answer replaces what was held, under its key; nothing fresh
 * keeps what was held, whatever key it came under, which is how a page for `cn-2` can go on
 * showing `cn-1` while its own answer is on the way. No key at all is no page to hold for,
 * and lets go: an id reached from the overview opens on its own answer, never on a faded
 * earlier one.
 */
export const hold = <T>(held: Held<T>, key: string | undefined, fresh: T | undefined): Held<T> =>
  key === undefined
    ? { key: undefined, value: undefined }
    : fresh === undefined
      ? held
      : { key, value: fresh };

/**
 * Like `useHeld`, but across a key change the previous answer is kept and marked stale
 * rather than let go: the page it drew stays on screen, set back, until the new one lands.
 */
export function useStale<T>(
  fresh: T | undefined,
  key: string | undefined,
): { value: T | undefined; stale: boolean } {
  const held = useRef<Held<T>>({ key, value: fresh });
  held.current = hold(held.current, key, fresh);
  return { value: held.current.value, stale: held.current.key !== key };
}
