// deployment.ts: the one place the page asks the deployment anything. Live subscriptions,
// each to a function cn calls: brief.get for the headline, epics.list for health and the
// rail, projects.list for the rail's Projects section and the Projects pages, blockers.list
// for what waits on a person, events.recent for the feed, issues.list for the lists and the
// jump bar; deployment.name, which cn does not call, for the rail's head and the tab title;
// and clock.next, which cn does not call either, through `useClock`, for the clock the
// others carry. The log page asks events.recent for more through `useLog`, while it is
// open, and the Projects routes ask projects.list once more through `usePulsed`, with each
// project's pulse, which the rail's subscription leaves out. Nothing here calls a mutation:
// the window reads. show.get is asked here too, through `useShown`, for the id on screen,
// and review.get through `useReview`, for an epic's page. undefined from any of them is the
// subscription not having answered yet, never an empty list; unanswered is the deployment
// not having answered at all.
import { api } from "@cairn/backend/convex/_generated/api.js";
import { JOURNAL_MAX, LOG_LIMIT } from "@cairn/backend/convex/lib/limits.js";
import type {
  BriefView,
  EpicLineView,
  LogEvent,
  ProjectView,
  ReviewView,
  Shown,
} from "@cairn/cli/views";
import {
  type RequestForQueries,
  useConvexConnectionState,
  useQueries,
  useQuery,
} from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useHeld } from "./held.ts";
import type { Destination } from "./JumpBar.tsx";
import { tick } from "./now.ts";
import type { WaitingBlocker } from "./Overview.tsx";
import type { Listed } from "./rows.tsx";

/**
 * The overview's feed, and the whole of its `events.recent` subscription: every write reruns
 * it, so it reads no more events than the column shows. The log page asks for its 200 on its
 * own, through `useLog`.
 */
export const FEED = 30;

/**
 * How long the page gives a deployment to open its socket before it says the deployment
 * did not answer, in milliseconds.
 */
export const WAIT = 5_000;

/** The secret a query carries, or nothing where there is none to send. */
export type Who = { secret?: string };

/** The `Who` for a secret: the secret, or nothing where there is none to send. */
export const whoOf = (secret: string | undefined): Who => (secret === undefined ? {} : { secret });

/**
 * The clock the page's queries carry: the moment it loaded, advanced only when the
 * deployment says a line would change. `clock.next` answers the earliest such moment after
 * the clock it was sent; one timer waits for it, held while the tab is hidden and caught
 * up when it is shown, and the clock then moves to the present. A tab left open sends a
 * new clock a few times a day rather than once a minute. Design §10.
 */
export function useClock(who: Who): number {
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(() => !document.hidden);
  const next = useQuery(api.clock.next, { ...who, now });

  useEffect(() => {
    const shown = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", shown);
    return () => document.removeEventListener("visibilitychange", shown);
  }, []);

  useEffect(() => {
    const step = tick(next, now, Date.now(), visible);
    if (step === undefined) return;
    if ("advance" in step) {
      setNow(Date.now());
      return;
    }
    // At or past the moment, never a hair before it: a timer that fires a millisecond early
    // would send a clock the moment has not reached, and every query would rerun twice.
    const moment = next ?? 0;
    const timer = setTimeout(() => setNow(Math.max(Date.now(), moment)), step.delay);
    return () => clearTimeout(timer);
  }, [next, now, visible]);

  return now;
}

/** Everything the page reads from the deployment, each `undefined` until it has answered. */
export type Deployment = {
  who: Who;
  brief: BriefView | undefined;
  epics: EpicLineView[] | undefined;
  projects: ProjectView[] | undefined;
  blockers: WaitingBlocker[] | undefined;
  issues: Listed[] | undefined;
  /** The newest `FEED` events, newest first: the feed, and the line under a latest epic. */
  events: LogEvent[] | undefined;
  /** Every issue, open epic and open blocker, for the jump bar. */
  destinations: Destination[];
  /** Whether WAIT has passed without the deployment ever opening its socket. */
  unanswered: boolean;
  /** The deployment's own name as the push recorded it, or null where none is recorded. */
  name: string | null | undefined;
};

/**
 * The seven subscriptions, the feed among them only `FEED` deep, the jump bar's destinations,
 * and whether the deployment answered.
 */
export function useDeployment(secret: string | undefined, now: number): Deployment {
  const who = whoOf(secret);
  const brief = useHeld(useQuery(api.brief.get, { ...who, now }));
  const epics = useHeld(useQuery(api.epics.list, { ...who, now }));
  const projects = useHeld(useQuery(api.projects.list, { ...who, now }));
  const blockers = useQuery(api.blockers.list, who);
  const issues: Listed[] | undefined = useQuery(api.issues.list, who);
  const events = useHeld(useQuery(api.events.recent, { ...who, limit: FEED }));
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

  return { who, brief, epics, projects, blockers, issues, events, destinations, unanswered, name };
}

/**
 * The log page's own subscription: the 200 newest events, newest first, or undefined until
 * they answer. It is alive only while that route is on screen, so no other screen pays for
 * 200 events on every write.
 */
export function useLog(who: Who): LogEvent[] | undefined {
  return useQuery(api.events.recent, { ...who, limit: LOG_LIMIT });
}

/**
 * `projects.list` again, with each project's pulse: the same list `useDeployment` holds for
 * the rail, subscribed only while a Projects route is on screen, so the rail on every other
 * screen reads no pulse rows.
 */
export function usePulsed(who: Who, now: number): ProjectView[] | undefined {
  return useHeld(useQuery(api.projects.list, { ...who, now, pulse: true }));
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
