// ListPages.tsx: the two pages that are a list of everything. Issues is `cn list`, grouped
// by where each issue stands, with what is finished folded away under what is not. The log
// is `cn log`: the feed, with the room a column beside the overview does not have.
import { LOG_LIMIT } from "@cairn/backend/convex/lib/limits.js";
import type { LogEvent } from "@cairn/cli/views";
import type { ReactNode } from "react";
import { FeedEvent } from "./Feed.tsx";
import { Pending, Title } from "./page.tsx";
import { Groups, type Listed } from "./rows.tsx";

function PageHead({ title, under }: { title: string; under: ReactNode }) {
  return (
    <header>
      <Title>{title}</Title>
      <p className="mt-2 text-slate">{under}</p>
    </header>
  );
}

export function IssuesPage({ issues }: { issues: Listed[] | undefined }) {
  if (issues === undefined) return <Pending>Reading the issues…</Pending>;
  const live = issues.filter((i) => i.status === "open" || i.status === "in_progress");
  return (
    <article>
      <PageHead
        title="Issues"
        under={
          issues.length === 0 ? (
            <>
              None yet.{" "}
              <code className="font-mono">
                cn create --project &lt;slug&gt; --epic &lt;ep-id&gt; --title "…"
              </code>{" "}
              puts the first one here.
            </>
          ) : (
            `${live.length} live of ${issues.length}, by priority then age, the way cn list orders them.`
          )
        }
      />
      <Groups issues={issues} />
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
