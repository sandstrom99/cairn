// held.ts: the last answer a live query gave, while the next one is on its way.
//
// `useQuery` answers `undefined` whenever its arguments change, until the deployment
// replies. The page changes `now` once a minute (now.ts), so without this every list on it
// would blink to "loading…" on the minute and back. Holding the previous answer across
// that gap is the pattern Convex documents as a stable query: `undefined` still means the
// first answer has not arrived, and never that a later one is pending.
import { useRef } from "react";

/**
 * `key` names what the answer is about. When it changes, what was held is about something
 * else and is let go: a page for `cn-2` must not show `cn-1` while its own answer is on
 * the way.
 */
export function useHeld<T>(fresh: T | undefined, key: string = ""): T | undefined {
  const held = useRef<{ key: string; value: T | undefined }>({ key, value: fresh });
  if (held.current.key !== key) held.current = { key, value: fresh };
  else if (fresh !== undefined) held.current.value = fresh;
  return held.current.value;
}
