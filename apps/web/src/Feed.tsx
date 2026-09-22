// Feed.tsx: `cn log`, live. One entry per event, newest first, each the pieces of
// `logLine` in its order: what it happened to, the kind, who, when, and the changes one
// to a line. `when` is drawn at the top right and stays third in the text, where cn has it.
//
// An event that arrives while the page is open lands with a sheen: the one motion on the
// page that nobody asked for, and the proof that a subscription, not a reload, brought it.
import {
  type HistoryEvent,
  type LogEvent,
  historyParts,
  logParts,
} from "@cairn/cli/src/lib/format.mts";
import {
  Check,
  CircleDot,
  Eye,
  Flag,
  GitMerge,
  Link2,
  NotebookPen,
  Pencil,
  Play,
  Plus,
  Undo2,
  X,
} from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
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
  run: GitMerge,
  sweep: GitMerge,
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
  const Icon = ICONS[kind.split(".")[1] ?? ""] ?? CircleDot;
  return (
    <li className={cn(ENTRY, landed && "landed")}>
      <span className="grid size-[30px] place-items-center rounded-[9px] bg-white/80 shadow-[0_0_0_1px_rgb(21_24_30/0.06)]">
        <Icon className="size-[15px]" />
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2.5">
        {/* The spaces between the pieces are cn's; a grid does not draw a bare one. */}
        <span className="col-start-1 row-start-1 min-w-0 text-row font-semibold">
          {target ? <Ref item={target} clip /> : <span className="text-mark">—</span>}
        </span>{" "}
        <span className="col-span-2 row-start-2 mt-px flex gap-2.5 text-meta text-slate">
          <span className="font-mono">{kind}</span> <span>{actor}</span>
        </span>{" "}
        <span className="col-start-2 row-start-1 text-meta text-slate">{when}</span>{" "}
        <Changes changes={changes} />
      </div>
    </li>
  );
}

function Changes({ changes }: { changes: string[] }) {
  if (changes.length === 0) return null;
  return (
    <ul className="col-span-2 row-start-3 mt-1.5 font-mono text-micro [overflow-wrap:anywhere] text-[#3a4150]">
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

/** The glass column on the right. What it lists is the page's to say. */
function Side({
  label,
  live = false,
  children,
  foot,
}: {
  label: string;
  live?: boolean;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <aside
      aria-label={label}
      className="glass fixed top-3 right-3 bottom-3 z-20 flex w-[384px] flex-col rounded-3xl max-[1100px]:hidden"
    >
      <div className="flex items-center px-5 pt-5 pb-3">
        <h2 className="text-[0.96875rem] font-[650] tracking-[-0.01em]">{label}</h2>
        {live && (
          <span className="ml-auto inline-flex items-center gap-[7px] text-meta text-slate">
            <i className="size-2 rounded-full bg-moving" />
            live
          </span>
        )}
      </div>
      {children}
      {foot && <div className="px-5 pt-3 pb-4 text-small text-slate">{foot}</div>}
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

export function Feed({ events, now }: { events: LogEvent[] | undefined; now: number }) {
  const landed = useLanded(events?.[0]?.at);
  return (
    <Side
      label="Activity"
      live
      foot={
        <a href="/log" className="hover:text-ink">
          Open the log
        </a>
      }
    >
      {events === undefined ? (
        <p className="px-5 text-small text-slate">Listening…</p>
      ) : events.length === 0 ? (
        <p className="px-5 text-small text-slate">
          Nothing has happened here yet. The first cn write shows up as it lands.
        </p>
      ) : (
        <ul className={LIST}>
          {events.map((event) => (
            <FeedEvent
              key={`${event.at} ${event.kind}`}
              event={event}
              now={now}
              landed={landed(event.at)}
            />
          ))}
        </ul>
      )}
    </Side>
  );
}

/**
 * One thing's own history, newest first: `cn show <id> --history`, which prints it oldest
 * first because a terminal is read downwards and a column beside a page is read from the top.
 * `self` is that id, so an edge among the events reads from this end.
 */
export function History({
  events,
  now,
  self,
}: {
  events: HistoryEvent[] | undefined;
  now: number;
  self: string;
}) {
  const newestFirst = events === undefined ? undefined : [...events].reverse();
  const landed = useLanded(newestFirst?.[0]?.at);
  return (
    <Side label="History" live>
      {newestFirst === undefined ? (
        <p className="px-5 text-small text-slate">Listening…</p>
      ) : (
        <ul className={LIST}>
          {newestFirst.map((event) => (
            <HistoryEntry
              key={`${event.at} ${event.kind}`}
              event={event}
              now={now}
              self={self}
              landed={landed(event.at)}
            />
          ))}
        </ul>
      )}
    </Side>
  );
}

const ENTRY =
  "relative grid grid-cols-[30px_minmax(0,1fr)] gap-[11px] overflow-hidden rounded-[14px] px-3 py-[13px] [&+li]:before:absolute [&+li]:before:top-0 [&+li]:before:right-3 [&+li]:before:left-[53px] [&+li]:before:border-t [&+li]:before:border-hair";

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
  const Icon = ICONS[kind.split(".")[1] ?? ""] ?? CircleDot;
  return (
    <li className={cn(ENTRY, landed && "landed")}>
      <span className="grid size-[30px] place-items-center rounded-[9px] bg-white/80 shadow-[0_0_0_1px_rgb(21_24_30/0.06)]">
        <Icon className="size-[15px]" />
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2.5">
        <span className="col-span-2 row-start-2 mt-px flex gap-2.5 text-meta text-slate">
          <span className="font-mono">{revision}</span> <span>{actor}</span>
        </span>{" "}
        <span className="col-start-2 row-start-1 text-meta text-slate">{when}</span>{" "}
        <span className="col-start-1 row-start-1 font-mono text-row font-semibold">{kind}</span>{" "}
        <Changes changes={changes} />
      </div>
    </li>
  );
}
