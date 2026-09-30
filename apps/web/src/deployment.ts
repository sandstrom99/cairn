// deployment.ts: the one place the page asks the deployment anything. Live subscriptions,
// each to a function cn calls: brief.get for the headline, epics.list for health and the
// rail, blockers.list for what waits on a person, events.recent for the feed and the log,
// issues.list for the lists and the jump bar; and deployment.name, which cn does not call,
// for the rail's head and the tab title. Nothing here calls a mutation: the window reads.
// show.get is asked here too, through `useShown`, for the id on screen, and
// review.get through `useReview`, for an epic's page. undefined from any of them is the
// subscription not having answered yet, never an empty list; unanswered is the deployment
// not having answered at all.
import { api } from "@cairn/backend/convex/_generated/api.js";
import { JOURNAL_MAX, LOG_LIMIT } from "@cairn/backend/convex/lib/limits.js";
import type { BriefView, EpicLineView, LogEvent, ReviewView, Shown } from "@cairn/cli/views";
import {
  type RequestForQueries,
  useConvexConnectionState,
  useQueries,
  useQuery,
} from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useHeld } from "./held.ts";
import type { Destination } from "./JumpBar.tsx";
import type { WaitingBlocker } from "./Overview.tsx";
import type { Listed } from "./rows.tsx";

/** How much of the feed the column shows: the head of the one subscription. */
export const FEED = 30;

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
  /** The deployment's own name as the push recorded it, or null where none is recorded. */
  name: string | null | undefined;
};

/** The six subscriptions, the jump bar's destinations, and whether the deployment answered. */
export function useDeployment(secret: string | undefined, now: number): Deployment {
  const who: Who = secret === undefined ? {} : { secret };
  const brief = useHeld(useQuery(api.brief.get, { ...who, now }));
  const epics = useHeld(useQuery(api.epics.list, { ...who, now }));
  const blockers = useQuery(api.blockers.list, who);
  const issues: Listed[] | undefined = useQuery(api.issues.list, who);
  const events = useHeld(useQuery(api.events.recent, { ...who, limit: LOG_LIMIT }));
  const name = useQuery(api.deployment.name, who);

  const destinations = useMemo<Destination[]>(
    () => [
      // The status as `cn list` prints it, `in_progress` included: the page words nothing a second way.
      ...(issues ?? []).map(({ id, title, status }) => ({ id, title, what: status })),
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

  return { who, brief, epics, blockers, issues, events, destinations, unanswered, name };
}

/**
 * `cn show <id> --history`, live, for the page on screen: the answer, the Error the deployment
 * threw, or undefined while it is on the way or there is no id. Through `useQueries`, which
 * hands an error back rather than throwing it, so a missing id is a value the page reads
 * (Lost) and not a boundary's business.
 */
export function useShown(who: Who, id: string | undefined, now: number): Shown | Error | undefined {
  // `useQueries` subscribes by the request object's identity and sets state during render
  // when it changes, so a fresh object every render is a render loop; `useQuery` memoises
  // its own the same way.
  const { secret } = who;
  const request = useMemo((): RequestForQueries => {
    if (id === undefined) return {};
    return {
      shown: {
        query: api.show.get,
        args: {
          ...(secret === undefined ? {} : { secret }),
          id,
          history: true,
          journal: JOURNAL_MAX,
          now,
        },
      },
    };
  }, [secret, id, now]);
  const answers = useQueries(request);
  return id === undefined ? undefined : (answers.shown as Shown | Error | undefined);
}

/**
 * `cn review <ep>`, live, for an epic's page: the answer, or undefined while it is on the way,
 * when the id is not an epic's, or when the deployment refused it.
 */
export function useReview(who: Who, id: string | undefined, now: number): ReviewView | undefined {
  // Memoised for the reason `useShown`'s request is.
  const { secret } = who;
  const request = useMemo((): RequestForQueries => {
    if (id === undefined || !id.startsWith("ep-")) return {};
    return {
      review: {
        query: api.review.get,
        args: { ...(secret === undefined ? {} : { secret }), id, now },
      },
    };
  }, [secret, id, now]);
  const answer = useQueries(request).review as ReviewView | Error | undefined;
  return answer instanceof Error ? undefined : answer;
}
