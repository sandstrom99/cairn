// clock.ts: the one argument a subscriber sends that a one-shot caller does not.
//
// A query reads the clock in two places: what is stuck (lib/health.ts) and deferral
// (lib/readiness.ts). `cn` asks once and is always fresh, so it never sends `now`. A
// `convex/react` subscription re-runs a query only when the data it read changes, never
// because time passed, so a page left open would never see an issue cross its stuck limit
// or a `deferUntil` pass on its own — it has to send its own clock instead. The page sends
// the clock it loaded with and moves it only when `clock.next` (convex/clock.ts) says a line
// would change, through `useClock` in apps/web/src/deployment.ts, so the query cache holds
// for hours at a time rather than a minute.
//
// It is a read-only view of the caller's own choosing, so nothing here validates it: a
// wrong `now` misleads only the caller that sent it.
import { v } from "convex/values";

/** `now` in milliseconds, optional: absent means the deployment's own clock. */
export const nowArg = { now: v.optional(v.number()) };
