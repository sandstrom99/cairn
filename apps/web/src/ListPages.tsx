// ListPages.tsx: the two pages that are a list of everything. Issues is `cn list`, filtered
// and paged in the browser over the list the page already holds, the filter in the query
// string (issues.ts), grouped by where each issue stands, and the states chips over it where
// the folds were. The log is `cn log`: the feed, with the room a column beside the overview
// does not have.
import { LOG_LIMIT } from "@cairn/backend/convex/lib/limits.js";
import type { EpicLineView, LogEvent, ProjectView } from "@cairn/cli/views";
import type { ReactNode } from "react";
import { Track } from "./Chart.tsx";
import { FeedEvent } from "./Feed.tsx";
import { Pager, Toolbar } from "./Filters.tsx";
import { type Filter, facets, matched, narrow, pageOf } from "./issues.ts";
import type { WaitingBlocker } from "./Overview.tsx";
import { Group, Pending, Title } from "./page.tsx";
import { closesOf, heldBy, trackOf } from "./projects.ts";
import { IssueRows, type Listed } from "./rows.tsx";

function PageHead({ title, under }: { title: string; under: ReactNode }) {
  return (
    <header>
      <Title>{title}</Title>
      <p className="mt-2 text-slate">{under}</p>
    </header>
  );
}

export function IssuesPage({
  issues,
  filter,
  epics,
  projects,
  blockers,
  now,
}: {
  issues: Listed[] | undefined;
  filter: Filter;
  epics: EpicLineView[] | undefined;
  projects: ProjectView[] | undefined;
  blockers: WaitingBlocker[] | undefined;
  now: number;
}) {
  if (issues === undefined) return <Pending>Reading the issues…</Pending>;
  if (issues.length === 0)
    return (
      <article>
        <PageHead
          title="Issues"
          under={
            <>
              None yet.{" "}
              <code className="font-mono">
                cn create --project &lt;slug&gt; --epic &lt;ep-id&gt; --title "…"
              </code>{" "}
              puts the first one here.
            </>
          }
        />
      </article>
    );
  const narrowed = narrow(issues, filter);
  const hits = matched(narrowed, filter);
  const page = pageOf(hits, filter.page);
  const stuck = (projects ?? []).flatMap((p) => p.health.stuck);
  return (
    <article>
      <PageHead
        title="Issues"
        under={`${hits.length} of ${issues.length}, by priority then age, the way cn list orders them.`}
      />
      <Toolbar
        filter={filter}
        counts={facets(narrowed)}
        epics={epics ?? []}
        projects={projects ?? []}
      />
      <Track
        cells={trackOf(hits, { health: { stuck } }, heldBy(blockers ?? []))}
        closes={closesOf(hits, now)}
      />
      {filter.states.length === 0 ? (
        <p className="mt-8 text-slate">No state picked. Turn one on above.</p>
      ) : hits.length === 0 ? (
        <p className="mt-8 text-slate">
          Nothing matches.{" "}
          <a href="/issues" className="underline">
            Reset the filters
          </a>
          .
        </p>
      ) : (
        <>
          {page.groups.map((g) => (
            <Group
              key={g.key}
              title={g.title}
              count={g.count}
              aside={g.rows.length < g.count ? `${g.from}–${g.to} of ${g.count}` : undefined}
            >
              <IssueRows issues={g.rows} />
            </Group>
          ))}
          <Pager filter={filter} page={page} />
        </>
      )}
    </article>
  );
}

export function LogPage({ events, now }: { events: LogEvent[] | undefined; now: number }) {
  return (
    <article>
      <PageHead title="Log" under="Everything cn wrote to this deployment, newest first." />
      {events === undefined ? (
        <Pending className="mt-8">Listening…</Pending>
      ) : events.length === 0 ? (
        <p className="mt-8 text-slate">
          Nothing yet. Every write cn makes lands here, from the first{" "}
          <code className="font-mono">cn epic new "…" --done-when "…"</code> on.
        </p>
      ) : (
        <ul className="paper mt-8 px-1 py-1">
          {events.map((event) => (
            <FeedEvent key={`${event.at} ${event.kind}`} event={event} now={now} />
          ))}
        </ul>
      )}
      {events !== undefined && events.length >= LOG_LIMIT && (
        <p className="mt-2 ml-0.5 text-meta text-slate">
          The {LOG_LIMIT} newest. <code className="font-mono">cn log --before &lt;date&gt;</code>{" "}
          reads further back.
        </p>
      )}
    </article>
  );
}
