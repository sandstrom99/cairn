// ListPages.tsx: the two pages that are a list of everything. Issues is `cn list`, grouped
// by where each issue stands, with what is finished folded away under what is not. The log
// is `cn log`: the feed, with the room a column beside the overview does not have.
import type { LogEvent } from "@cairn/cli/views";
import { FeedEvent } from "./Feed.tsx";
import { IssueRows } from "./IssueRows.tsx";
import type { Listed } from "./ItemPages.tsx";
import { Group } from "./Sheet.tsx";

const LIVE: { title: string; pick: (issue: Listed) => boolean }[] = [
  { title: "In progress", pick: (i) => i.status === "in_progress" },
  { title: "Open", pick: (i) => i.status === "open" && i.type !== "follow-up" },
  { title: "Follow-ups", pick: (i) => i.status === "open" && i.type === "follow-up" },
];

const DONE: { title: string; pick: (issue: Listed) => boolean }[] = [
  { title: "Closed", pick: (i) => i.status === "closed" },
  { title: "Dropped", pick: (i) => i.status === "dropped" },
];

function PageHead({ title, under }: { title: string; under: string }) {
  return (
    <header>
      <h1 className="text-[1.875rem] leading-[1.18] font-bold tracking-[-0.024em]">{title}</h1>
      <p className="mt-2 text-slate">{under}</p>
    </header>
  );
}

export function IssuesPage({ issues }: { issues: Listed[] | undefined }) {
  if (issues === undefined) return <p className="text-slate">Reading the issues…</p>;
  const live = issues.filter((i) => i.status === "open" || i.status === "in_progress");
  return (
    <article>
      <PageHead
        title="Issues"
        under={
          issues.length === 0
            ? "None yet."
            : `${live.length} live of ${issues.length}, by priority then age, the way cn list orders them.`
        }
      />
      {LIVE.map(({ title, pick }) => {
        const picked = issues.filter(pick);
        return picked.length === 0 ? null : (
          <Group key={title} title={title} count={picked.length}>
            <IssueRows issues={picked} />
          </Group>
        );
      })}
      {DONE.map(({ title, pick }) => {
        const picked = issues.filter(pick);
        return picked.length === 0 ? null : (
          <details key={title} className="group mt-8">
            <summary className="ml-0.5 cursor-pointer text-small font-semibold text-slate hover:text-ink">
              {title}
              <span className="ml-2 font-mono font-normal text-faint">{picked.length}</span>
            </summary>
            <div className="mt-2.5">
              <IssueRows issues={picked} />
            </div>
          </details>
        );
      })}
    </article>
  );
}

export function LogPage({ events, now }: { events: LogEvent[] | undefined; now: number }) {
  return (
    <article>
      <PageHead title="Log" under="Everything cn wrote to this deployment, newest first." />
      {events === undefined ? (
        <p className="mt-8 text-slate">Listening…</p>
      ) : (
        <ul className="paper mt-8 px-1 py-1">
          {events.map((event) => (
            <FeedEvent key={`${event.at} ${event.kind}`} event={event} now={now} />
          ))}
        </ul>
      )}
      {events !== undefined && events.length >= 200 && (
        <p className="mt-2 ml-0.5 text-meta text-slate">
          The 200 newest. <code className="font-mono">cn log --before &lt;date&gt;</code> reads
          further back.
        </p>
      )}
    </article>
  );
}
