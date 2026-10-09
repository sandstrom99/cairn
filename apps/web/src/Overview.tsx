// Overview.tsx: what the page opens on. The brief as a headline, what waits on a person
// where there is any, what is moving and what just landed, what is stuck, up next, the first
// of what is ready, then every open epic with its health. The band of projects between the
// headline and what waits is Band.tsx's.
//
// Every row here is one of cn's lines, typeset. The pieces come from the `…Parts`
// functions in @cairn/cli's parts.mts, the same ones the lines themselves are joined
// from, and the text a row ends up with is the line: the separators cn prints stay in the
// markup, pale or unseen, so a row copied off the page pastes as cn's output.
// rows.test.tsx holds each row to that.
//
// Nothing here holds state or asks the deployment anything, so a test renders it to a
// string. The queries are in App.tsx.
import { blockerParts, firstLine, healthParts, logParts } from "@cairn/cli/parts";
import type { BlockerLineView, BriefView, EpicLineView, LogEvent } from "@cairn/cli/views";
import type { Referable } from "@cairn/cli/ref";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { headline, underline } from "./brief.ts";
import { CountBar } from "./Chart.tsx";
import { Group } from "./page.tsx";
import { Ref, Refs, Run } from "./Ref.tsx";
import { HealthRows, IssueRows, type Listed, RowLink } from "./rows.tsx";
import { StateWord } from "./tone.tsx";

export function Brief({ view }: { view: BriefView }) {
  const under = underline(view);
  return (
    <header>
      <h1 className="text-brief font-bold tracking-[-0.028em] text-balance narrow:text-[1.875rem]">
        {headline(view).map((clause, i) => (
          <Fragment key={clause.text}>
            {i > 0 && " "}
            <span className={cn("inline-block", clause.empty && "font-medium text-faint")}>
              {clause.text}
            </span>
          </Fragment>
        ))}
      </h1>
      {under && <p className="mt-3.5 text-base text-slate">{under}</p>}
    </header>
  );
}

/** `cn waiting`, as the block the page puts first: each blocker, and what it holds. */
export function Waiting({ blockers, now }: { blockers: WaitingBlocker[]; now: number }) {
  if (blockers.length === 0) return null;
  return (
    <Group title="Waiting on you" id="waiting-on-you" className="mt-10">
      <div className="paper paper-waiting divide-y divide-hair">
        {blockers.map((blocker) => (
          <BlockerRow key={blocker.id} blocker={blocker} now={now} />
        ))}
      </div>
    </Group>
  );
}

export type WaitingBlocker = BlockerLineView & { issues: Referable[] };

/**
 * `cn brief`'s in progress and done lines as rows: what is being worked on, then what just
 * landed, newest first. The count is both, the closes past the heads included. Nothing where
 * neither has any.
 */
export function Moving({ view, now }: { view: BriefView; now: number }) {
  const count = view.inProgress.length + view.recent.count;
  if (count === 0) return null;
  return (
    <Group title="Moving" id="moving" count={count} className="mt-10">
      <IssueRows issues={[...view.inProgress, ...view.recent.top]} now={now} />
    </Group>
  );
}

/**
 * `cn brief`'s stuck line as rows: each with its silence, drawn against its priority's
 * limit. Nothing where nothing is stuck; a row here is never under Up next as well.
 */
export function Stuck({ view, now }: { view: BriefView; now: number }) {
  if (view.stuck.count === 0) return null;
  return (
    <Group title="Stuck" id="stuck" count={view.stuck.count} className="mt-10">
      <IssueRows issues={view.stuck.top} now={now} meter="stuck" />
    </Group>
  );
}

/** `cn ready`, as the first rows of it: the ready count beside the title, and the heads the brief carries as rows. Nothing where nothing is ready. */
export function UpNext({ view }: { view: BriefView }) {
  if (view.ready.count === 0) return null;
  return (
    <Group title="Up next" id="up-next" count={view.ready.count} className="mt-10">
      <IssueRows issues={view.ready.top} />
    </Group>
  );
}

function BlockerRow({ blocker, now }: { blocker: WaitingBlocker; now: number }) {
  const { target, kind, tail } = blockerParts(blocker, now);
  return (
    <div className="divide-y divide-hair">
      {/* cn's order is reference, kind, tail; the page leads with the kind as its state word. */}
      <div className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 px-4 py-[13px] narrow:grid-cols-[78px_minmax(0,1fr)]">
        <Ref item={target} className="col-start-2 row-start-1" />{" "}
        <span className="col-start-1 row-start-1">
          <StateWord word={kind} tone="waiting" className="text-small" />
        </span>
        <span className="col-start-2 text-small text-slate">
          <span className="unseen"> · </span>
          <Run text={tail} />
        </span>
      </div>
      {blocker.issues.length > 0 && (
        <div className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline gap-3 px-4 py-[11px] text-row narrow:grid-cols-[78px_minmax(0,1fr)]">
          <span className="text-small text-slate">holds</span>{" "}
          <span>
            <Refs items={blocker.issues} />
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * `cn epic list`: the epics with something to say first, newest activity first, each its
 * block with its description under the head line the way `cn show` has it. With nothing
 * live, the two epics touched last stand where the live ones would, each with the newest
 * log line that landed in it, so the page still says what the deployment has been doing;
 * the rest are listed under "Nothing moving", and an epic shown above is not listed again.
 */
export function Epics({
  epics,
  events,
  issues,
  now,
}: {
  epics: EpicLineView[];
  /**
   * The feed's events, the newest 30, newest first, for the line under a latest epic: an epic
   * whose last event is older than those shows no line. Undefined until they answer.
   */
  events: LogEvent[] | undefined;
  /** Every issue, for which epic an event's issue is under; undefined until they answer. */
  issues: Listed[] | undefined;
  now: number;
}) {
  if (epics.length === 0)
    return (
      <p className="mt-10 text-slate">
        No open epics. <code className="font-mono text-small">cn epic new "…" --done-when "…"</code>{" "}
        starts one.
      </p>
    );
  const parts = epics.map((view) => ({ view, ...healthParts(view, now) }));
  // An outcome's done-when is always there, so it says nothing about whether the epic moves.
  const live = parts
    .filter((p) => p.rows.some((row) => row.fact !== "doneWhen"))
    .sort((a, b) => b.view.lastActivity - a.view.lastActivity);
  const still = parts.filter((p) => !live.includes(p));
  const latest =
    live.length === 0
      ? [...still].sort((a, b) => b.view.lastActivity - a.view.lastActivity).slice(0, 2)
      : [];
  const listed = still.filter((p) => !latest.includes(p));
  return (
    <>
      {live.map((p, i) => (
        <EpicSection key={p.view.id} view={p.view} counts={p.counts} first={i === 0}>
          <HealthRows rows={p.rows} />
        </EpicSection>
      ))}
      {latest.map((p, i) => (
        <EpicSection key={p.view.id} view={p.view} counts={p.counts} first={i === 0}>
          {p.rows.length > 0 && <HealthRows rows={p.rows} />}
          <LastEvent epic={p.view} events={events} issues={issues} now={now} />
        </EpicSection>
      ))}
      {listed.length > 0 && (
        <Group title="Nothing moving" id="nothing-moving">
          <ul className="paper divide-y divide-hair">
            {listed.map(({ view, counts }) => (
              <RowLink
                key={view.id}
                href={`/${view.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 narrow:grid-cols-1"
              >
                <Ref item={view} plain className="decoration-faint underline-offset-[3px]" />{" "}
                <span className="inline-flex items-center gap-2.5">
                  <CountBar counts={view.counts} type={view.type} text={counts} />
                  <Run text={counts} className="text-small text-slate" />
                </span>
              </RowLink>
            ))}
          </ul>
        </Group>
      )}
    </>
  );
}

/** One epic's block: its head line as `cn epic list` prints it, the first line of its description under it, then what the caller lists. */
function EpicSection({
  view,
  counts,
  first,
  children,
}: {
  view: EpicLineView;
  counts: string;
  first: boolean;
  children: ReactNode;
}) {
  return (
    <section className={first ? "mt-10" : "mt-8"}>
      <div className="mx-0.5 mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-title font-[620] tracking-[-0.012em]">
          <Ref item={view} />
        </h2>{" "}
        <span className="ml-auto inline-flex items-center gap-2.5 narrow:ml-0">
          <CountBar counts={view.counts} type={view.type} text={counts} />
          <Run text={counts} className="text-small text-slate" />
        </span>
      </div>
      {view.description && <Lead text={view.description} href={`/${view.id}`} />}
      {children}
    </section>
  );
}

/**
 * The first line of an epic's description, the cut `cn show` gives an issue's fields: the
 * line as written, `…` after it where more follows, and that mark a link to the epic's page,
 * where the whole text is set. An epic that is a map stays one line here, so its rows are
 * what the block shows.
 */
function Lead({ text, href }: { text: string; href: string }) {
  const line = firstLine(text);
  // firstLine marks a cut with `…`; a first line that ends in one of its own is not cut.
  const cut = line.endsWith("…") && line !== firstLine(text.split("\n", 1)[0] ?? "");
  return (
    <p className="mx-0.5 mb-2.5 max-w-[68ch] text-small break-words text-slate">
      {cut ? line.slice(0, -1) : line}
      {cut && (
        <a href={href} className="text-faint hover:text-ink">
          …
        </a>
      )}
    </p>
  );
}

/**
 * The newest line of the log that landed in the epic: on the epic itself, or on an issue
 * under it. Its text is `logLine`'s, cut to one line by the box rather than reworded.
 * Nothing where the events the page holds have none.
 */
function LastEvent({
  epic,
  events,
  issues,
  now,
}: {
  epic: Referable;
  events: LogEvent[] | undefined;
  issues: Listed[] | undefined;
  now: number;
}) {
  const under = new Set((issues ?? []).filter((i) => i.epic.id === epic.id).map((i) => i.id));
  const event = events?.find(
    (e) => e.epic?.id === epic.id || (e.issue !== undefined && under.has(e.issue.id)),
  );
  if (!event) return null;
  const { target, kind, actor, when, changes } = logParts(event, now);
  return (
    <p className="mx-0.5 truncate text-small text-slate">
      {target ? <Ref item={target} /> : <span className="text-mark">—</span>}{" "}
      <span className="font-mono">{kind}</span> {actor} {when}
      {changes.length > 0 && <span className="font-mono"> {changes.join(", ")}</span>}
    </p>
  );
}
