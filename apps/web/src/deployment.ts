// deployment.ts: the one place the page asks the deployment anything. Live subscriptions,
// each to a function cn calls: brief.get for the headline, epics.list for health and the
// rail, blockers.list for what waits on a person, events.recent for the feed and the log,
// issues.list for the lists and the jump bar. Nothing here calls a mutation: the window
// reads. A page for one id adds show.get from inside the gate that catches its not-found
// (App.tsx). undefined from any of them is the subscription not having answered yet, never
// an empty list; unanswered is the deployment not having answered at all.
import { api } from "@cairn/backend/convex/_generated/api.js";
import type { BriefView, EpicLineView, LogEvent } from "@cairn/cli/views";
import { useConvexConnectionState, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useHeld } from "./held.ts";
import type { Listed } from "./ItemPages.tsx";
import type { Destination } from "./JumpBar.tsx";
import type { WaitingBlocker } from "./Overview.tsx";

/** How much of the feed the Overview keeps beside it, and how much the log page holds. */
const FEED = 30;
const LOG = 200;

/**
 * How long the page gives a deployment to open its socket before it says the deployment
 * did not answer, in milliseconds.
 */
export const WAIT = 5_000;

/** The secret a query carries, or nothing where there is none to send. */
export type Who = { secret?: string };

/** Everything the page reads from the deployment, each `undefined` until it has answered. */
export type Deployment = {
  who: Who;
  brief: BriefView | undefined;
  epics: EpicLineView[] | undefined;
  blockers: WaitingBlocker[] | undefined;
  issues: Listed[] | undefined;
  events: LogEvent[] | undefined;
  /** Every issue, open epic and open blocker, for the jump bar. */
  destinations: Destination[];
  /** Whether WAIT has passed without the deployment ever opening its socket. */
  unanswered: boolean;
};

/** The five subscriptions, the jump bar's destinations, and whether the deployment answered. */
export function useDeployment(secret: string | undefined, now: number, onLog: boolean): Deployment {
  const who: Who = secret === undefined ? {} : { secret };
  const brief = useHeld(useQuery(api.brief.get, { ...who, now }));
  const epics = useHeld(useQuery(api.epics.list, { ...who, now }));
  const blockers = useQuery(api.blockers.list, who);
  const issues: Listed[] | undefined = useQuery(api.issues.list, who);
  const events = useHeld(
    useQuery(api.events.recent, { ...who, limit: onLog ? LOG : FEED }),
    onLog ? "log" : "feed",
  );

  const destinations = useMemo<Destination[]>(
    () => [
      ...(issues ?? []).map(({ id, title, status }) => ({
        id,
        title,
        what: status.replace("_", " "),
      })),
      ...(epics ?? []).map(({ id, title }) => ({ id, title, what: "epic" })),
      ...(blockers ?? []).map(({ id, title }) => ({ id, title, what: "blocker" })),
    ],
    [issues, epics, blockers],
  );

  // A deployment that never opens its socket never answers anything; after WAIT that is the
  // fact to show.
  const connection = useConvexConnectionState();
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), WAIT);
    return () => clearTimeout(timer);
  }, []);
  const unanswered = waited && !connection.hasEverConnected;

  return { who, brief, epics, blockers, issues, events, destinations, unanswered };
}
