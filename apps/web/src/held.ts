// held.ts: the last answer a live query gave, while the next one is on its way.
//
// `useQuery` answers `undefined` whenever its arguments change, until the deployment
// replies. The page changes `now` once a minute (now.ts), so without this every list on it
// would blink to "loading…" on the minute and back. Holding the previous answer across
// that gap is the pattern Convex documents as a stable query: `undefined` still means the
// first answer has not arrived, and never that a later one is pending.
import { useRef } from "react";

export function useHeld<T>(fresh: T | undefined): T | undefined {
  const held = useRef(fresh);
  if (fresh !== undefined) held.current = fresh;
  return held.current;
}
