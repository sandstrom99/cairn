// Feed.tsx: the column on the right and its entries. `cn log`, live, or one thing's own
// history. One entry per event, newest first, each the pieces of `logLine` in its order:
// what it happened to, the kind, who, when, and the changes one to a line. `when` is drawn
// at the top right and stays third in the text, where cn has it.
//
// An event that arrives while the page is open lands with a sheen: the one motion on the
// page that nobody asked for, and the proof that a subscription, not a reload, brought it.
// The column collapses to a strip from a control in its head, and whether it is collapsed is
// the reader's choice, kept in this browser (column.ts).
import { historyParts, logParts } from "@cairn/cli/parts";
import type { HistoryEvent, LogEvent } from "@cairn/cli/views";
import {
  Check,
  CircleDot,
  Eye,
  Flag,
  Link2,
  NotebookPen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Play,
  Plus,
  Undo2,
  X,
} from "lucide-react";
import { type ComponentType, Fragment, type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Pending } from "./page.tsx";
import { Ref } from "./Ref.tsx";

// By the word after the dot: `issue.claim` and a later `thing.claim` are the same act.
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  create: Plus,
  claim: Play,
  release: Undo2,
  update: Pencil,
  close: Check,
  drop: X,
  append: NotebookPen,
  add: Link2,
  remove: Link2,
  raise: Flag,
  attach: Flag,
  ack: Eye,
  resolve: Check,
};

export function FeedEvent({
  event,
  now,
  landed = false,
}: {
  event: LogEvent;
  now: number;
  landed?: boolean;
}) {
  const { target, kind, actor, when, changes } = logParts(event, now);
  return (
    <EventEntry
      kind={kind}
      head={target ? <Ref item={target} clip /> : <span className="text-mark">—</span>}
      mark={kind}
      actor={actor}
      when={when}
      changes={changes}
      landed={landed}
    />
  );
}

const ENTRY =
  "relative grid grid-cols-[30px_minmax(0,1fr)] gap-[11px] overflow-hidden rounded-[14px] px-3 py-[13px] [&+li]:before:absolute [&+li]:before:top-0 [&+li]:before:right-3 [&+li]:before:left-[53px] [&+li]:before:border-t [&+li]:before:border-hair";

/**
 * One event as the pieces of its line, on the tile and grid every entry shares. The head is
 * the bold top-left cell, the mark the mono piece before the actor on the meta line. Where
 * the head falls in the text is the line's: first, where logLine leads with the target, or
 * after `when`, where a history line puts the kind third.
 */
export function EventEntry({
  kind,
  head,
  mark,
  actor,
  when,
  changes,
  headAfterWhen = false,
  landed = false,
}: {
  /** The event's kind, which picks the icon. */
  kind: string;
  head: ReactNode;
  mark: string;
  actor: string;
  when: string;
  changes: string[];
  headAfterWhen?: boolean;
  landed?: boolean;
}) {
  const Icon = ICONS[kind.split(".")[1] ?? ""] ?? CircleDot;
  const cell = (
    <span className="col-start-1 row-start-1 min-w-0 text-row font-semibold">{head}</span>
  );
  return (
    <li className={cn(ENTRY, landed && "landed")}>
      <span className="grid size-[30px] place-items-center rounded-[9px] bg-lift shadow-ring">
        <Icon className="size-[15px]" />
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2.5">
        {/* The spaces between the pieces are cn's; a grid does not draw a bare one. */}
        {!headAfterWhen && <>{cell} </>}
        <span className="col-span-2 row-start-2 mt-px flex gap-2.5 text-meta text-slate">
          <span className="font-mono">{mark}</span> <span>{actor}</span>
        </span>{" "}
        <span className="col-start-2 row-start-1 text-meta text-slate">{when}</span>{" "}
        {headAfterWhen && <>{cell} </>}
        <Changes changes={changes} />
      </div>
    </li>
  );
}

function Changes({ changes }: { changes: string[] }) {
  if (changes.length === 0) return null;
  return (
    <ul className="col-span-2 row-start-3 mt-1.5 font-mono text-micro [overflow-wrap:anywhere] text-code">
      {changes.map((change, i) => (
        // The changes of one event never reorder, so the index is a stable key.
        <li key={i}>
          <Change text={change} />
          {i < changes.length - 1 && <span className="unseen">, </span>}
        </li>
      ))}
    </ul>
  );
}

/** `status open → in_progress`: the field stepped back, the arrow pale, the values as they are. */
function Change({ text }: { text: string }) {
  const space = text.indexOf(" ");
  const arrow = text.indexOf(" → ");
  if (space < 0 || arrow < 0) return <>{text}</>;
  return (
    <>
      <span className="text-slate">{text.slice(0, space)}</span>
      {text.slice(space, arrow)}
      <span className="text-mark"> → </span>
      {text.slice(arrow + 3)}
    </>
  );
}

/** What the column lists: the deployment's feed, or one thing's own history. */
export type Listing =
  | { kind: "feed"; events: LogEvent[] | undefined }
  | { kind: "history"; self: string; events: HistoryEvent[] | undefined };

/** What stands on the right: the column, the strip it collapses to, or nothing where the route lists nothing. */
export type ColumnState = "open" | "collapsed" | "none";

/** The glass column on the right, mounted once by the shell. What it lists is the route's to say; whether it is collapsed is the reader's. */
export function Column({
  listing,
  now,
  collapsed,
  onToggle,
}: {
  listing: Listing;
  now: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const label = listing.kind === "feed" ? "Activity" : "History";
  return (
    <aside
      aria-label={label}
      className={cn(
        "glass folds fixed top-(--gutter) right-(--gutter) bottom-(--gutter) z-20 overflow-hidden rounded-3xl mid:hidden",
        collapsed ? "w-(--side-strip)" : "w-(--side-width)",
      )}
    >
      {/* The one control, outside what fades, first in the tab order and above it: 12px in from
          the right, so it is centred in the strip. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand the column" : "Collapse the column"}
        className="absolute top-[18px] right-3 z-10 text-slate"
      >
        {collapsed ? <PanelRightOpen /> : <PanelRightClose />}
      </Button>
      {/* Laid out at the column's full width and anchored to its right edge, so the aside narrows
          over it and nothing inside reflows: the contents fade, and while collapsed they are
          inert, out of the tab order and unread. */}
      <div
        inert={collapsed}
        className={cn(
          "folds absolute inset-y-0 right-0 flex w-(--side-width) flex-col",
          collapsed && "opacity-0",
        )}
      >
        <div className="flex items-center pt-5 pr-12 pb-3 pl-5">
          <h2 className="text-[0.96875rem] font-[650] tracking-[-0.01em]">{label}</h2>
          <span className="ml-auto inline-flex items-center gap-[7px] text-meta text-slate">
            <i className="size-2 rounded-full bg-moving" />
            live
          </span>
        </div>
        {/* The keys are deliberate: the same feed keeps its list and its scroll from the overview
            to an epic, and one id's history is its own list. */}
        {listing.kind === "feed" ? (
          <EventList
            key="feed"
            events={listing.events}
            empty={
              <p className="px-5 text-small text-slate">
                Nothing has happened here yet. The first cn write shows up as it lands.
              </p>
            }
            entry={(event, landed) => <FeedEvent event={event} now={now} landed={landed} />}
          />
        ) : (
          // One thing's own history, newest first: `cn show <id> --history`, which prints it
          // oldest first because a terminal is read downwards and a column beside a page is
          // read from the top. `self` is that id, so an edge among the events reads from this end.
          <EventList
            key={listing.self}
            events={listing.events && [...listing.events].reverse()}
            entry={(event, landed) => (
              <HistoryEntry event={event} now={now} self={listing.self} landed={landed} />
            )}
          />
        )}
        {listing.kind === "feed" && (
          <div className="px-5 pt-3 pb-4 text-small text-slate">
            <a href="/log" className="hover:text-ink">
              Open the log
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}

const LIST = "flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:thin]";

/**
 * Which events arrived while the page was open: anything newer than what was newest at the
 * last render that had events. On the first answer there is no "last", so nothing lands.
 */
function useLanded(newest: number | undefined): (at: number) => boolean {
  const seen = useRef<number | undefined>(undefined);
  const threshold = seen.current;
  useEffect(() => {
    if (newest !== undefined) seen.current = newest;
  }, [newest]);
  return (at) => threshold !== undefined && at > threshold;
}

/** A column's list, newest first: the pending line until the subscription answers, then a row per event, each marked when it arrived while the page was open. */
function EventList<E extends { at: number; kind: string }>({
  events,
  empty,
  entry,
}: {
  events: E[] | undefined;
  /** What stands where there is nothing yet. A thing's own history always has its create, so it passes none. */
  empty?: ReactNode;
  entry: (event: E, landed: boolean) => ReactNode;
}) {
  const landed = useLanded(events?.[0]?.at);
  if (events === undefined) return <Pending className="px-5 text-small">Listening…</Pending>;
  if (events.length === 0) return empty ?? null;
  return (
    <ul className={LIST}>
      {events.map((event) => (
        <Fragment key={`${event.at} ${event.kind}`}>{entry(event, landed(event.at))}</Fragment>
      ))}
    </ul>
  );
}

/** `r4  wsl/claude  2h ago  issue.update  priority 2 → 1`, with the kind drawn first. */
export function HistoryEntry({
  event,
  now,
  self,
  landed = false,
}: {
  event: HistoryEvent;
  now: number;
  self?: string;
  landed?: boolean;
}) {
  const { revision, actor, when, kind, changes } = historyParts(event, now, self);
  return (
    <EventEntry
      kind={kind}
      head={<span className="font-mono">{kind}</span>}
      mark={revision}
      actor={actor}
      when={when}
      changes={changes}
      headAfterWhen
      landed={landed}
    />
  );
}
