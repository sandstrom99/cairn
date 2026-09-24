// App.tsx: the secret and the route, and nothing else. `App` holds the secret as state and
// the gate that turns a refused secret into the form; `Window` reads the route, asks
// `useDeployment` (deployment.ts), and puts the page for it into the `Shell`; `Item` is the
// page for one id under its own gate.
//
// The path picks the page (location.ts). The rail, the ground and the jump bar stay where
// they are across pages and so do the subscriptions under them, so going from an epic to
// one of its issues changes the middle of the screen and nothing else.
//
// The secret is state rather than a build-time value, because the deployment answers
// `unauthorized` to a caller that did not send the right one and the page has to be able
// to ask. A second gate sits around the page for one id, because an id nobody minted is
// the deployment answering, not refusing.
import { api } from "@cairn/backend/convex/_generated/api.js";
import type { LogEvent } from "@cairn/cli/views";
import { ref } from "@cairn/cli/ref";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Unanswered } from "./Connect.tsx";
import { useDeployment, WAIT, type Who } from "./deployment.ts";
import { Feed, History } from "./Feed.tsx";
import { Gate, Lost } from "./Gate.tsx";
import { useHeld } from "./held.ts";
import { BlockerPage, EpicPage, IssuePage, type Listed } from "./ItemPages.tsx";
import { IssuesPage, LogPage } from "./ListPages.tsx";
import { type Route, routeOf, useLinks, usePath } from "./location.ts";
import { useMinute } from "./now.ts";
import { Brief, Epics, Waiting } from "./Overview.tsx";
import { devSecret, readSecret, writeSecret } from "./secret.ts";
import { Shell } from "./Shell.tsx";

export function App({ url }: { url: string }) {
  const [secret, setSecret] = useState<string | undefined>(() => readSecret() ?? devSecret());
  // Every submit and every forget remounts the gate, so a secret that is wrong twice is tried twice.
  const [attempt, setAttempt] = useState(0);
  const host = new URL(url).host;
  // The value entered is the secret for this page load, whether or not storage keeps it.
  const connect = (entered: string) => {
    const trimmed = entered.trim();
    writeSecret(trimmed);
    setSecret(trimmed || devSecret());
    setAttempt((n) => n + 1);
  };
  const forget = () => {
    writeSecret("");
    setSecret(devSecret());
    setAttempt((n) => n + 1);
  };
  return (
    <Gate key={attempt} host={host} onSecret={connect}>
      <Window host={host} secret={secret} onForget={forget} onSecret={connect} />
    </Gate>
  );
}

/** The live page. `undefined` is a subscription not having answered yet, never an empty list. */
function Window({
  host,
  secret,
  onForget,
  onSecret,
}: {
  host: string;
  secret: string | undefined;
  onForget: () => void;
  onSecret: (secret: string) => void;
}) {
  useLinks();
  const path = usePath();
  const route = routeOf(path);
  const now = useMinute();
  const onLog = route?.page === "log";
  const { who, brief, epics, blockers, issues, events, destinations, unanswered } = useDeployment(
    secret,
    now,
    onLog,
  );

  // The epic the rail marks: the one on screen, or the one the issue on screen belongs to.
  const id = route?.page === "item" ? route.id : undefined;
  const epicId = id?.startsWith("ep-") ? id : issues?.find((i) => i.id === id)?.epic.id;

  const named = destinations.find((d) => d.id === id);
  const title = titleOf(route, named ? ref(named) : id);
  useEffect(() => {
    document.title = title;
  }, [title]);

  if (unanswered) return <Unanswered host={host} seconds={WAIT / 1000} />;

  // The log is the feed with room, so it has no feed beside it and takes the width. One id's
  // page brings its own column, the history, from inside <Item>.
  const item = route?.page === "item";
  const side = !onLog;
  return (
    <Shell
      host={host}
      epics={epics}
      current={path}
      epicId={epicId}
      waiting={(brief?.waiting ?? 0) > 0}
      side={side}
      column={!item && side ? <Feed events={events} now={now} /> : undefined}
      destinations={destinations}
      onForget={onForget}
    >
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
        <Gate key={route.id} host={host} what={route.id} onSecret={onSecret}>
          <Item id={route.id} who={who} now={now} issues={issues} events={events} />
        </Gate>
      )}
    </Shell>
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
