// App.tsx: the secret, the theme and the route, and nothing else. `App` holds the secret and
// the theme (theme.ts) as state, and the gate that turns a refused secret into the form;
// `Window` reads the route, asks `useDeployment` and `useShown` (deployment.ts), holds the
// previous id's page across a change with `useStale` (held.ts), and hands the `Shell` the
// page, what the column lists, whether the column is collapsed (column.ts) and the theme;
// `ItemPage` is the page for one id, and `LogLive` the log page with its own subscription.
//
// The path picks the page (location.ts). The rail, the ground and the jump bar stay where
// they are across pages and so do the subscriptions under them, so going from an epic to
// one of its issues changes the middle of the screen and nothing else.
//
// The secret is state rather than a build-time value, because the deployment answers
// `unauthorized` to a caller that did not send the right one and the page has to be able
// to ask. A second gate sits around the page for one id, for a page that breaks: a missing
// id is an answer the page reads (Lost), since show.get is asked through `useQueries`, which
// hands its error back rather than throwing it.
import { ref } from "@cairn/cli/ref";
import type { LogEvent, ReviewView, Shown } from "@cairn/cli/views";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { readCollapsed, writeCollapsed } from "./column.ts";
import { Unanswered } from "./Connect.tsx";
import { useDeployment, useLog, useReview, useShown, WAIT, type Who } from "./deployment.ts";
import type { Listing } from "./Feed.tsx";
import { Broken, errorData, Gate, Lost } from "./Gate.tsx";
import { useStale } from "./held.ts";
import { BlockerPage, EpicPage, IssuePage } from "./ItemPages.tsx";
import { IssuesPage, LogPage } from "./ListPages.tsx";
import { type Route, routeOf, useLinks, usePath } from "./location.ts";
import { useMinute } from "./now.ts";
import { Brief, Epics, Waiting } from "./Overview.tsx";
import { Pending } from "./page.tsx";
import { ProjectPage, ProjectsPage } from "./ProjectPages.tsx";
import type { Listed } from "./rows.tsx";
import { devSecret, readSecret, writeSecret } from "./secret.ts";
import { Shell } from "./Shell.tsx";
import {
  applyTheme,
  onSystemTheme,
  readTheme,
  resolveTheme,
  systemTheme,
  type Theme,
  writeTheme,
} from "./theme.ts";

export function App({ url }: { url: string }) {
  const [secret, setSecret] = useState<string | undefined>(() => readSecret() ?? devSecret());
  // Every submit and every forget remounts the gate, so a secret that is wrong twice is tried twice.
  const [attempt, setAttempt] = useState(0);
  // Light or dark is this browser's choice, or the system's until it makes one (theme.ts).
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(readTheme(), systemTheme()));
  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    writeTheme(next);
    setTheme(next);
  };
  useEffect(() => applyTheme(theme), [theme]);
  // While no choice is stored, the system's changing changes the page.
  useEffect(
    () =>
      onSystemTheme((system) => {
        if (readTheme() === undefined) setTheme(system);
      }),
    [],
  );
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
    <Gate key={attempt} host={host} secret={secret} onSecret={connect}>
      <Window
        host={host}
        secret={secret}
        onForget={forget}
        onSecret={connect}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    </Gate>
  );
}

/** The live page. `undefined` is a subscription not having answered yet, never an empty list. */
function Window({
  host,
  secret,
  onForget,
  onSecret,
  theme,
  onToggleTheme,
}: {
  host: string;
  secret: string | undefined;
  onForget: () => void;
  onSecret: (secret: string) => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  useLinks();
  const path = usePath();
  // Whether the column is collapsed is this browser's choice, kept like the secret: read once
  // on load, written the moment it is made.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleColumn = () => {
    writeCollapsed(!collapsed);
    setCollapsed(!collapsed);
  };
  const route = routeOf(path);
  const now = useMinute();
  const { who, brief, epics, projects, blockers, issues, events, destinations, unanswered, name } =
    useDeployment(secret, now);
  const id = route?.page === "item" ? route.id : undefined;
  const slug = route?.page === "project" ? route.slug : undefined;
  const answer = useShown(who, id, now);
  const review = useReview(who, id, now);
  const error = answer instanceof Error ? answer : undefined;
  const { value: shown, stale } = useStale(answer instanceof Error ? undefined : answer, id);

  // The epic the rail marks: the one on screen, or the one the issue on screen belongs to.
  const epicId = id?.startsWith("ep-") ? id : issues?.find((i) => i.id === id)?.epic.id;

  const named = destinations.find((d) => d.id === id);
  const title = titleOf(route, named ? ref(named) : id, name ?? "cairn");
  useEffect(() => {
    document.title = title;
  }, [title]);

  if (unanswered) return <Unanswered host={host} seconds={WAIT / 1000} />;

  // A refused secret is the whole window's business and goes up to the gate around it; anything
  // else about this id shows inside main, with the rail still there.
  if (error !== undefined && errorData(error)?.kind === "unauthorized") throw error;

  // The log is the feed with room, so it has no column and takes the width. One id's page lists
  // its own history beside it, the previous id's while that page is the one still on screen; an
  // epic has none worth a column, and an id that errored has no page, so the deployment's feed
  // stays.
  const listing: Listing | undefined =
    route?.page === "log"
      ? undefined
      : id !== undefined && error === undefined && shown !== undefined && shown.kind !== "epic"
        ? { kind: "history", self: shown.id, events: shown.events }
        : { kind: "feed", events };
  return (
    <Shell
      name={name ?? undefined}
      host={host}
      epics={epics}
      projects={projects}
      slug={slug}
      current={path}
      epicId={epicId}
      waiting={(brief?.waiting ?? 0) > 0}
      listing={listing}
      collapsed={collapsed}
      onToggleColumn={toggleColumn}
      theme={theme}
      onToggleTheme={onToggleTheme}
      now={now}
      destinations={destinations}
      onForget={onForget}
    >
      {route === undefined ? (
        <Lost what={path} />
      ) : route.page === "overview" ? (
        brief === undefined || epics === undefined ? (
          <Pending>Reading {host}…</Pending>
        ) : (
          <>
            <Brief view={brief} />
            <Waiting blockers={blockers ?? []} now={now} />
            <Epics epics={epics} events={events} issues={issues} now={now} />
          </>
        )
      ) : route.page === "projects" ? (
        <ProjectsPage projects={projects} issues={issues} blockers={blockers} now={now} />
      ) : route.page === "project" ? (
        <ProjectPage
          slug={route.slug}
          projects={projects}
          issues={issues}
          blockers={blockers}
          now={now}
        />
      ) : route.page === "issues" ? (
        <IssuesPage issues={issues} />
      ) : route.page === "log" ? (
        <LogLive who={who} events={events} now={now} />
      ) : (
        <Gate key={route.id} host={host} secret={secret} what={route.id} onSecret={onSecret}>
          {error !== undefined ? (
            errorData(error)?.kind === "not-found" ? (
              <Lost what={route.id} />
            ) : (
              <Broken message={errorData(error)?.message ?? error.message} secret={secret} />
            )
          ) : shown === undefined ? (
            <Pending>Reading {route.id}…</Pending>
          ) : (
            <ItemPage shown={shown} stale={stale} issues={issues} review={review} now={now} />
          )}
        </Gate>
      )}
    </Shell>
  );
}

/** The tab's title: the page, then the deployment's word, or the word alone on the overview. */
export const titleOf = (
  route: Route | undefined,
  named: string | undefined,
  deployment: string,
): string =>
  route?.page === "item" && named
    ? `${named} · ${deployment}`
    : route?.page === "projects"
      ? `Projects · ${deployment}`
      : route?.page === "project"
        ? `${route.slug} · ${deployment}`
        : route?.page === "issues"
          ? `Issues · ${deployment}`
          : route?.page === "log"
            ? `Log · ${deployment}`
            : deployment;

/**
 * The log page, on a subscription of its own that lives only while the route is on screen,
 * since `Window` cannot ask for it conditionally. Until the 200 newest answer, it shows the
 * feed's events, which are already there, so moving from the overview never blinks it empty.
 */
function LogLive({ who, events, now }: { who: Who; events: LogEvent[] | undefined; now: number }) {
  const log = useLog(who);
  return <LogPage events={log ?? events} now={now} />;
}

/** The page for one id, set back while the answer it shows is the previous id's. */
function ItemPage({
  shown,
  stale,
  issues,
  review,
  now,
}: {
  shown: Shown;
  stale: boolean;
  issues: Listed[] | undefined;
  /** `cn review` of the epic on screen, when it is an epic. */
  review: ReviewView | undefined;
  now: number;
}) {
  return (
    <div
      className={cn(
        "transition-opacity duration-300 ease-out motion-reduce:transition-none",
        stale && "opacity-50",
      )}
    >
      {shown.kind === "epic" ? (
        <EpicPage
          epic={shown}
          issues={(issues ?? []).filter((i) => i.epic.id === shown.id)}
          review={review}
          now={now}
        />
      ) : shown.kind === "blocker" ? (
        <BlockerPage blocker={shown} now={now} />
      ) : (
        <IssuePage
          issue={shown}
          siblings={(issues ?? []).filter((i) => i.epic.id === shown.epic.id)}
          now={now}
        />
      )}
    </div>
  );
}
