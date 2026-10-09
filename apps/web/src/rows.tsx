// rows.tsx: the lists of the page, a row each. Every row is one of cn's lines typeset, its
// pieces from the `…Parts` functions in @cairn/cli's parts.mts and its text the line, the
// separators cn prints kept in the markup, pale or unseen (rows.test.tsx). A row is a link
// to the page of what it names. The issues are grouped the way `cn list` implies: what is
// live first, what is finished folded away.
//
// Every row has one shape, the `.row` grid in index.css: a dot in the state's chroma leads,
// the title stands on its own line, the facts sit under it as one quiet line, and what is
// live about it stands at the right of the title. An issue's row is `issueLine` typeset: the
// facts are the id, the priority and the epic where the list spans epics; the live cell is
// who holds it and, where the list was asked how long each issue has been silent, the
// silence (`listLine`), with a meter of it against its priority's limit under the words.
// The status word is the dot: it stays in the text, unseen, and the dot says it, hollow for
// open, teal for in progress, ink for closed and pale for dropped, the fills the track uses.
// The revision, `r3`, stays in the text unseen too: it is the token a retry carries, for an
// agent, and says nothing to a person. cn's order is kept in the markup; the grid places it.
import { STUCK_AFTER_MS } from "@cairn/backend/convex/lib/thresholds.js";
import { type HealthRow, issueParts } from "@cairn/cli/parts";
import type { Referable } from "@cairn/cli/ref";
import { age } from "@cairn/cli/time";
import type { IssueLineView, ListLineView } from "@cairn/cli/views";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Meter } from "./Chart.tsx";
import { Group } from "./page.tsx";
import { Ref } from "./Ref.tsx";
import { Dot, Priority, type Tone, toneText } from "./tone.tsx";

/** An issue as a list carries it: enough for a row, which epic, project and kind it is, and when it last moved. */
export type Listed = IssueLineView & {
  epic: Referable;
  type: string;
  project: string;
  lastActivity: number;
  closedAt?: number;
};

/** A row that is a link to one page: the `li` and the `a`, with the hover every row shares. The caller sets the grid. */
export function RowLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        className={cn(
          "items-baseline px-4 py-3 hover:bg-ink/[0.022] hover:[&_.ref-title]:underline",
          className,
        )}
      >
        {children}
      </a>
    </li>
  );
}

/** The cells every row shares: the title's line, the facts under it, and the live cell at the right. */
const TITLE = "[grid-area:title] text-row font-[550] leading-[1.45] text-ink";
const FACT = "text-meta text-slate";
const LIVE = "justify-self-end whitespace-nowrap text-meta text-slate narrow:justify-self-start";
/** A visual `·` before a fact that is not in cn's line, where a column stands in a terminal. */
const LED = "before:mr-1.5 before:text-mark before:content-['·']";

/** The dot of a status, by the fills the track uses: hollow, teal, ink, pale. */
function StatusDot({ status, tone, title }: { status: string; tone?: Tone; title: string }) {
  const shared = "mt-[0.4em] [grid-area:dot]";
  if (tone !== undefined && tone !== "still")
    return <Dot tone={tone} className={shared} title={title} />;
  if (status === "in_progress") return <Dot tone="moving" className={shared} title={title} />;
  if (status === "closed")
    return <i className={cn("size-2 shrink-0 rounded-full bg-ink", shared)} title={title} />;
  if (status === "dropped")
    return <i className={cn("size-2 shrink-0 rounded-full bg-mark", shared)} title={title} />;
  return <Dot tone="still" className={shared} title={title} />;
}

/**
 * A list of issues, a row each. With `now`, a row that carries its silence prints it the way
 * `cn list --silent` does; with `meter` too, the row ends with that silence drawn in the tone
 * given, against its priority's limit, and its dot takes the tone.
 */
export function IssueRows({
  issues,
  now,
  meter,
}: {
  issues: ListLineView[];
  now?: number;
  meter?: Tone;
}) {
  return (
    <ul className="paper divide-y divide-hair">
      {issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} now={now} meter={meter} />
      ))}
    </ul>
  );
}

function IssueRow({ issue, now, meter }: { issue: ListLineView; now?: number; meter?: Tone }) {
  const { target, priority, status, epic, claimedBy, revision } = issueParts(issue);
  const silentSince = now === undefined ? undefined : issue.silentSince;
  const silent = silentSince === undefined ? undefined : age(silentSince, now);
  const metered = meter !== undefined && silentSince !== undefined && now !== undefined;
  const finished = status === "closed" || status === "dropped";
  return (
    <RowLink href={`/${target.id}`} className="row">
      <Ref
        item={target}
        cells={{
          id: cn("[grid-area:id]", FACT, LED),
          title: cn(TITLE, finished && "text-slate", status === "dropped" && "text-faint"),
        }}
      />{" "}
      <span className={cn("[grid-area:pri]", FACT)}>
        <Priority token={priority} className="text-micro" />
      </span>{" "}
      {/* The status is the dot; the word stays in the text for a reader who copies the row or hears it. */}
      <span className="contents">
        <StatusDot status={status} tone={meter} title={status} />
        <span className="unseen">{status}</span>
      </span>
      {epic && (
        <>
          {" "}
          <Ref
            item={epic}
            plain
            clip
            className={cn("[grid-area:epic] min-w-0", FACT, LED, "before:shrink-0")}
          />
        </>
      )}
      {claimedBy && (
        <span
          className={cn(
            LIVE,
            "[grid-area:holder]",
            meter === undefined || meter === "still" ? "text-ink" : toneText(meter),
          )}
        >
          <span className="unseen"> · </span>
          {claimedBy}
        </span>
      )}
      {revision && (
        <>
          {/* cn's `r3`, the token a retry carries: in the text for an agent reading the row, and not drawn, since it says nothing to a person. */}{" "}
          <span className="unseen">{revision}</span>
        </>
      )}
      {silent && (
        <span
          className={cn(
            LIVE,
            "[grid-area:silent]",
            claimedBy && LED,
            meter !== undefined && meter !== "still" && toneText(meter),
          )}
        >
          {/* Inside the text, after who holds it, cn's `·` is a separator; the column, or the drawn dot, does its job on the page. */}
          <span className="unseen"> · </span>
          silent {silent}
        </span>
      )}
      {metered && (
        <span className="mt-px [grid-area:meter] justify-self-end narrow:hidden">
          <Meter
            silentMs={now - silentSince}
            limit={STUCK_AFTER_MS[issue.priority]}
            tone={meter}
            title={`silent ${silent}`}
          />
        </span>
      )}
    </RowLink>
  );
}

/**
 * An epic's facts, a row each: an outcome's done-when, what is moving, what is stuck, what
 * waits on a person. The done-when, and the stuck issues past the first three counted in
 * one row, link nowhere.
 */
export function HealthRows({
  rows,
  className = "paper divide-y divide-hair",
}: {
  rows: HealthRow[];
  /** The list's own classes, where it sits inside a card rather than being one. */
  className?: string;
}) {
  return (
    <ul className={className}>
      {rows.map((row) => (
        <HealthRowLine
          key={"target" in row ? `${row.fact} ${row.target.id}` : row.fact}
          row={row}
        />
      ))}
    </ul>
  );
}

function HealthRowLine({ row }: { row: HealthRow }) {
  if (!("target" in row))
    return (
      <li className="grid grid-cols-[8px_minmax(0,1fr)] items-baseline gap-x-2.5 px-4 py-3">
        <span />
        {row.fact === "doneWhen" ? (
          <span className="text-small text-slate">
            <span className="mr-2 font-[550] text-faint">done when</span> {row.tail}
          </span>
        ) : (
          <span className="text-small text-slate">{row.tail}</span>
        )}
      </li>
    );
  // A waiting row's tail opens with cn's `· `, which a column makes redundant.
  const led = row.tail.startsWith("· ");
  return (
    <RowLink href={`/${row.target.id}`} className="row row-fact">
      <span className="contents">
        <Dot tone={row.fact} className="mt-[0.4em] [grid-area:dot]" title={row.fact} />
        <span className={cn("[grid-area:word] font-[550]", FACT, toneText(row.fact))}>
          {row.fact}
        </span>
      </span>{" "}
      <Ref item={row.target} cells={{ id: cn("[grid-area:id]", FACT, LED), title: TITLE }} />{" "}
      <span className={cn(LIVE, "[grid-area:holder]")}>
        {led && <span className="unseen">· </span>}
        {led ? row.tail.slice(2) : row.tail}
      </span>
    </RowLink>
  );
}

/** Where each issue stands, the way `cn list` groups them: what is live first, what is finished folded away. */
const GROUPS: { title: string; pick: (issue: Listed) => boolean; folded: boolean }[] = [
  { title: "In progress", pick: (i) => i.status === "in_progress", folded: false },
  { title: "Open", pick: (i) => i.status === "open" && i.type !== "follow-up", folded: false },
  {
    title: "Follow-ups",
    pick: (i) => i.status === "open" && i.type === "follow-up",
    folded: false,
  },
  { title: "Closed", pick: (i) => i.status === "closed", folded: true },
  { title: "Dropped", pick: (i) => i.status === "dropped", folded: true },
];

/** A row on an epic's own page does not repeat the epic, the way `cn show ep-3` does not. */
const withoutEpic = ({
  id,
  title,
  status,
  priority,
  claimedBy,
  revision,
}: Listed): IssueLineView => ({
  id,
  title,
  status,
  priority,
  claimedBy,
  revision,
});

/** The issues in their groups, a titled list each, empty groups left out. */
export function Groups({
  issues,
  ownEpic = false,
}: {
  issues: Listed[];
  /** Set on an epic's own page, where the rows drop the epic. */
  ownEpic?: boolean;
}) {
  return (
    <>
      {GROUPS.map(({ title, pick, folded }) => {
        const picked = issues.filter(pick);
        if (picked.length === 0) return null;
        return (
          <Group key={title} title={title} count={picked.length} folded={folded}>
            <IssueRows issues={ownEpic ? picked.map(withoutEpic) : picked} />
          </Group>
        );
      })}
    </>
  );
}
