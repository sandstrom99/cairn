// App.tsx: the shell, and the only file that asks the deployment anything. Five live
// subscriptions, each to a function `cn` calls: `brief.get` for the headline, `epics.list`
// for health, `blockers.list` for what waits on a person, `events.recent` for the feed and
// `issues.list` for the jump bar. Nothing here calls a mutation: the window reads.
//
// The secret is state rather than a build-time value, because the deployment answers
// `unauthorized` to a caller that did not send the right one and the page has to be able
// to ask. An error boundary around the subscriptions is what carries that answer to the
// reader: convex/react throws a ConvexError out of `useQuery`, and the guard's line names
// the fix. Changing the secret remounts the boundary, so a fixed secret clears the error.
import { api } from "@cairn/backend/convex/_generated/api.js";
import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Component, type ReactNode, useMemo, useState } from "react";
import { Connect } from "./Connect.tsx";
import { Feed } from "./Feed.tsx";
import { Ground } from "./Ground.tsx";
import { useHeld } from "./held.ts";
import { type Destination, JumpBar } from "./JumpBar.tsx";
import { useMinute } from "./now.ts";
import { Brief, Epics, Waiting } from "./Overview.tsx";
import { Rail } from "./Rail.tsx";
import { devSecret, readSecret, writeSecret } from "./secret.ts";

/** How much of the feed the Overview keeps beside it. The rest is the log's. */
const FEED = 30;

export function App({ url }: { url: string }) {
  const [secret, setSecret] = useState<string | undefined>(() => readSecret() ?? devSecret());
  const host = new URL(url).host;

  return (
    <ErrorBoundary
      key={secret ?? ""}
      fallback={(message) => (
        <>
          <Ground waiting={false} />
          <Connect
            host={host}
            message={message}
            onSecret={(entered) => {
              writeSecret(entered);
              setSecret(readSecret() ?? devSecret());
            }}
          />
        </>
      )}
    >
      <Window host={host} secret={secret} />
    </ErrorBoundary>
  );
}

/** The live page. `undefined` is a subscription not having answered yet, never an empty list. */
function Window({ host, secret }: { host: string; secret: string | undefined }) {
  const now = useMinute();
  const who = secret === undefined ? {} : { secret };
  const brief = useHeld(useQuery(api.brief.get, { ...who, now }));
  const epics = useHeld(useQuery(api.epics.list, { ...who, now }));
  const blockers = useQuery(api.blockers.list, who);
  const events = useQuery(api.events.recent, { ...who, limit: FEED });
  const issues = useQuery(api.issues.list, who);

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

  return (
    <>
      <Ground waiting={(brief?.waiting ?? 0) > 0} />
      <Rail host={host} epics={epics} />
      <main className="relative z-10 ml-[276px] mr-[396px] px-10 pt-16 pb-36 max-[1100px]:mr-0 max-[720px]:ml-0 max-[720px]:px-4 max-[720px]:pt-9">
        <div className="mx-auto max-w-[760px]">
          {brief === undefined || epics === undefined ? (
            <p className="text-slate">Reading {host}…</p>
          ) : (
            <>
              <Brief view={brief} />
              <Waiting blockers={blockers ?? []} now={now} />
              <Epics epics={epics} now={now} />
            </>
          )}
        </div>
      </main>
      <Feed events={events} now={now} />
      <JumpBar destinations={destinations} />
    </>
  );
}

/**
 * A ConvexError's `data` when the backend threw one of its own (lib/errors.ts, lib/guard.ts):
 * the kind is for a program, the message is the line a person reads.
 */
type ErrorData = { message?: unknown };

/** What to show the reader: the deployment's own message where it sent one. */
function messageOf(error: Error): string {
  if (error instanceof ConvexError) {
    const data = error.data as ErrorData | undefined;
    if (typeof data === "object" && data !== null && typeof data.message === "string")
      return data.message;
  }
  return error.message;
}

class ErrorBoundary extends Component<
  { children: ReactNode; fallback: (message: string) => ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error === undefined) return this.props.children;
    return this.props.fallback(messageOf(error));
  }
}
