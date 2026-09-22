// App.tsx: the shell, and the only file that asks the deployment anything. Live
// subscriptions, each to a function `cn` calls: `brief.get` for the headline, `epics.list`
// for health and the rail, `blockers.list` for what waits on a person, `events.recent` for
// the feed and the log, `issues.list` for the lists and the jump bar, and on a page for one
// id, `show.get` with its history. Nothing here calls a mutation: the window reads.
//
// The path picks the page (location.ts). The rail, the ground and the jump bar stay where
// they are across pages and so do the subscriptions under them, so going from an epic to
// one of its issues changes the middle of the screen and nothing else.
//
// The secret is state rather than a build-time value, because the deployment answers
// `unauthorized` to a caller that did not send the right one and the page has to be able
// to ask. An error boundary around the subscriptions is what carries that answer to the
// reader: convex/react throws a ConvexError out of `useQuery`, and the guard's line names
// the fix. Changing the secret remounts the boundary, so a fixed secret clears the error.
// A second boundary sits around the page for one id, because an id nobody minted is the
// deployment answering, not refusing.
import { api } from "@cairn/backend/convex/_generated/api.js";
import type { LogEvent } from "@cairn/cli/src/lib/format.mts";
import { ref } from "@cairn/cli/src/lib/ref.mts";
import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Connect } from "./Connect.tsx";
import { Feed, History } from "./Feed.tsx";
import { Ground } from "./Ground.tsx";
import { useHeld } from "./held.ts";
import { BlockerPage, EpicPage, IssuePage, type Listed } from "./ItemPages.tsx";
import { type Destination, JumpBar } from "./JumpBar.tsx";
import { IssuesPage, LogPage } from "./ListPages.tsx";
import { type Route, routeOf, useLinks, usePath } from "./location.ts";
import { useMinute } from "./now.ts";
import { Brief, Epics, Waiting } from "./Overview.tsx";
import { Rail } from "./Rail.tsx";
import { devSecret, readSecret, writeSecret } from "./secret.ts";

/** How much of the feed the Overview keeps beside it, and how much the log page holds. */
const FEED = 30;
const LOG = 200;

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

type Who = { secret?: string };

/** The live page. `undefined` is a subscription not having answered yet, never an empty list. */
function Window({ host, secret }: { host: string; secret: string | undefined }) {
  useLinks();
  const path = usePath();
  const route = routeOf(path);
  const now = useMinute();
  const who: Who = secret === undefined ? {} : { secret };

  const brief = useHeld(useQuery(api.brief.get, { ...who, now }));
  const epics = useHeld(useQuery(api.epics.list, { ...who, now }));
  const blockers = useQuery(api.blockers.list, who);
  const issues: Listed[] | undefined = useQuery(api.issues.list, who);
  const onLog = route?.page === "log";
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

  // The epic the rail marks: the one on screen, or the one the issue on screen belongs to.
  const id = route?.page === "item" ? route.id : undefined;
  const epicId = id?.startsWith("ep-") ? id : issues?.find((i) => i.id === id)?.epic.id;

  const named = destinations.find((d) => d.id === id);
  const title = titleOf(route, named ? ref(named) : id);
  useEffect(() => {
    document.title = title;
  }, [title]);

  // The log is the feed with room, so it has no feed beside it and takes the width.
  const item = route?.page === "item";
  const side = !onLog;
  return (
    <>
      <Ground waiting={(brief?.waiting ?? 0) > 0} />
      <Rail host={host} epics={epics} current={path} epicId={epicId} />
      <main
        className={cn(
          "relative z-10 ml-[276px] px-10 pt-16 pb-36 max-[720px]:ml-0 max-[720px]:px-4 max-[720px]:pt-9",
          side && "mr-[396px] max-[1100px]:mr-0",
        )}
      >
        <div className="mx-auto max-w-[760px]">
          {route === undefined ? (
            <Lost what={path} />
          ) : route.page === "overview" ? (
            brief === undefined || epics === undefined ? (
              <p className="text-slate">Reading {host}…</p>
            ) : (
              <>
                <Brief view={brief} />
                <Waiting blockers={blockers ?? []} now={now} />
                <Epics epics={epics} now={now} />
              </>
            )
          ) : route.page === "issues" ? (
            <IssuesPage issues={issues} />
          ) : route.page === "log" ? (
            <LogPage events={events} now={now} />
          ) : (
            <ErrorBoundary key={route.id} fallback={() => <Lost what={route.id} />}>
              <Item id={route.id} who={who} now={now} issues={issues} events={events} />
            </ErrorBoundary>
          )}
        </div>
      </main>
      {/* One id's page brings its own column, the history, from inside <Item>. */}
      {!item && side && <Feed events={events} now={now} />}
      <JumpBar destinations={destinations} side={side} />
    </>
  );
}

const titleOf = (route: Route | undefined, named: string | undefined): string =>
  route?.page === "item" && named
    ? `${named} · cairn`
    : route?.page === "issues"
      ? "Issues · cairn"
      : route?.page === "log"
        ? "Log · cairn"
        : "cairn";

/** The page for one id: `cn show <id> --history`, live, and its history in the column beside it. */
function Item({
  id,
  who,
  now,
  issues,
  events,
}: {
  id: string;
  who: Who;
  now: number;
  issues: Listed[] | undefined;
  events: LogEvent[] | undefined;
}) {
  const shown = useHeld(useQuery(api.show.get, { ...who, id, history: true, now }), id);
  if (shown === undefined) return <p className="text-slate">Reading {id}…</p>;

  if (shown.kind === "epic")
    return (
      <>
        <EpicPage epic={shown} issues={(issues ?? []).filter((i) => i.epic.id === id)} now={now} />
        {/* An epic has no history of its own worth a column; the deployment's activity stays. */}
        <Feed events={events} now={now} />
      </>
    );
  if (shown.kind === "blocker")
    return (
      <>
        <BlockerPage blocker={shown} now={now} />
        <History events={shown.events} now={now} self={shown.id} />
      </>
    );
  return (
    <>
      <IssuePage
        issue={shown}
        siblings={(issues ?? []).filter((i) => i.epic.id === shown.epic.id)}
        now={now}
      />
      <History events={shown.events} now={now} self={shown.id} />
    </>
  );
}

/** A path that names nothing: said plainly, with the way back. */
function Lost({ what }: { what: string }) {
  return (
    <div>
      <h1 className="text-[1.875rem] leading-[1.18] font-bold tracking-[-0.024em]">
        Nothing here is called {what}
      </h1>
      <p className="mt-3 text-slate">
        It may have been typed wrong, or live on another deployment.{" "}
        <a href="/" className="text-ink underline decoration-faint underline-offset-[3px]">
          Back to the overview
        </a>
        , or press ⌘K and look for it by title.
      </p>
    </div>
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
