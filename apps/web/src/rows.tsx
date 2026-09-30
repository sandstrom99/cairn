// rows.tsx: the lists of the page, a row each. Every row is one of cn's lines typeset, its
// pieces from the `…Parts` functions in @cairn/cli's parts.mts and its text the line, the
// separators cn prints kept in the markup, pale or unseen (rows.test.tsx). A row is a link
// to the page of what it names. The issues are grouped the way `cn list` implies: what is
// live first, what is finished folded away.
//
// An issue's row is `issueLine` typeset: the reference, the priority, the status, the epic
// where the list spans epics, and who holds it. cn's order is kept in the text; on the page
// the status leads, because down a column of rows it is the word the eye sorts by. Where
// the list was asked how long each issue has been silent, the row is `listLine`, the
// silence after who holds it, and a meter of it against its priority's limit may close it.
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
import { StateWord, type Tone } from "./tone.tsx";

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
          "items-baseline px-4 py-[13px] hover:bg-ink/[0.022] hover:[&_.ref-title]:underline",
          className,
        )}
      >
        {children}
      </a>
    </li>
  );
}

/** A resting status word in a column, by weight rather than tone: no chroma, no dot. */
const LEVEL: Record<string, string> = {
  open: "text-ink",
  closed: "text-slate",
  dropped: "text-faint",
};

/**
 * A list of issues, a row each. With `now`, a row that carries its silence prints it the way
 * `cn list --silent` does; with `meter` too, the row ends with that silence drawn in the tone
 * given, against its priority's limit.
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
  const { target, priority, status, epic, claimedBy } = issueParts(issue);
  const silentSince = now === undefined ? undefined : issue.silentSince;
  const silent = silentSince === undefined ? undefined : age(silentSince, now);
  return (
    <RowLink
      href={`/${target.id}`}
      className={cn(
        "grid gap-x-3 gap-y-0.5 narrow:grid-cols-[112px_minmax(0,1fr)]",
        meter !== undefined && silentSince !== undefined
          ? "grid-cols-[112px_minmax(0,1fr)_auto_auto_56px]"
          : "grid-cols-[112px_minmax(0,1fr)_auto_auto]",
      )}
    >
      <Ref
        item={target}
        plain
        className={cn(
          "col-start-2 row-start-1 decoration-faint underline-offset-[3px]",
          (status === "closed" || status === "dropped") && "text-slate",
        )}
      />{" "}
      <span className="col-start-3 row-start-1 font-mono text-meta text-slate narrow:col-start-2 narrow:row-start-3">
        {priority}
      </span>{" "}
      {status === "in_progress" ? (
        <StateWord word={status} tone="moving" className="col-start-1 row-start-1 text-small" />
      ) : (
        <span
          className={cn(
            "col-start-1 row-start-1 inline-flex items-center gap-2 text-small font-[550]",
            LEVEL[status],
          )}
        >
          {status}
        </span>
      )}
      {epic && (
        <>
          {" "}
          <Ref item={epic} plain clip className="col-start-2 row-start-2 text-small text-slate" />
        </>
      )}
      {(claimedBy || silent) && (
        <span className="col-start-4 row-start-1 text-small text-slate narrow:col-start-2 narrow:row-start-4">
          {claimedBy && (
            <>
              <span className="unseen"> · </span>
              {claimedBy}
            </>
          )}
          {silent && (
            <>
              {/* Inside the cell, after who holds it, cn's `·` is a separator the eye needs. */}
              <span className={claimedBy ? "text-mark" : "unseen"}> · </span>
              silent {silent}
            </>
          )}
        </span>
      )}
      {meter !== undefined && silentSince !== undefined && now !== undefined && (
        <span className="col-start-5 row-start-1 self-center narrow:hidden">
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

const ROW =
  "grid grid-cols-[92px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 narrow:grid-cols-[78px_minmax(0,1fr)]";
const TAIL = "text-small whitespace-nowrap text-slate narrow:col-start-2";

/**
 * An epic's facts, a row each: what is moving, what is stuck, what waits on a person. The
 * stuck issues past the first three are counted in one row that links nowhere.
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
          key={row.fact === "more" ? "more" : `${row.fact} ${row.target.id}`}
          row={row}
        />
      ))}
    </ul>
  );
}

function HealthRowLine({ row }: { row: HealthRow }) {
  if (row.fact === "more")
    return (
      <li className={cn("items-baseline px-4 py-[13px]", ROW)}>
        <span />
        <span className="text-small text-slate">{row.tail}</span>
      </li>
    );
  // A waiting row's tail opens with cn's `· `, which a column makes redundant.
  const led = row.tail.startsWith("· ");
  return (
    <RowLink href={`/${row.target.id}`} className={ROW}>
      <StateWord word={row.fact} className="text-small" />{" "}
      <Ref item={row.target} plain className="decoration-faint underline-offset-[3px]" />{" "}
      <span className={TAIL}>
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
const withoutEpic = ({ id, title, status, priority, claimedBy }: Listed): IssueLineView => ({
  id,
  title,
  status,
  priority,
  claimedBy,
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
