// Feed.tsx: `cn log`, live. One entry per event, newest first, each the pieces of
// `logLine` in its order: what it happened to, the kind, who, when, and the changes one
// to a line. `when` is drawn at the top right and stays third in the text, where cn has it.
//
// An event that arrives while the page is open lands with a sheen: the one motion on the
// page that nobody asked for, and the proof that a subscription, not a reload, brought it.
import { type LogEvent, logParts } from "@cairn/cli/src/lib/format.mts";
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
import { type ComponentType, useEffect, useRef } from "react";
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
    <li
      className={cn(
        "relative grid grid-cols-[30px_minmax(0,1fr)] gap-[11px] overflow-hidden rounded-[14px] px-3 py-[13px]",
        "[&+li]:before:absolute [&+li]:before:top-0 [&+li]:before:right-3 [&+li]:before:left-[53px] [&+li]:before:border-t [&+li]:before:border-hair",
        landed && "landed",
      )}
    >
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
        {changes.length > 0 && (
          <ul className="col-span-2 row-start-3 mt-1.5 font-mono text-micro [overflow-wrap:anywhere] text-[#3a4150]">
            {changes.map((change, i) => (
              // The changes of one event never reorder, so the index is a stable key.
              <li key={i}>
                <Change text={change} />
                {i < changes.length - 1 && <span className="unseen">, </span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
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

export function Feed({ events, now }: { events: LogEvent[] | undefined; now: number }) {
  // What was newest at the last render that had events. Anything newer than that arrived
  // while the page was open; on the first answer there is no "last", so nothing lands.
  const newest = events?.[0]?.at;
  const seen = useRef<number | undefined>(undefined);
  const threshold = seen.current;
  useEffect(() => {
    if (newest !== undefined) seen.current = newest;
  }, [newest]);

  return (
    <aside
      aria-label="Activity"
      className="glass fixed top-3 right-3 bottom-3 z-20 flex w-[384px] flex-col rounded-3xl max-[1100px]:hidden"
    >
      <div className="flex items-center px-5 pt-5 pb-3">
        <h2 className="text-[0.96875rem] font-[650] tracking-[-0.01em]">Activity</h2>
        <span className="ml-auto inline-flex items-center gap-[7px] text-meta text-slate">
          <i className="size-2 rounded-full bg-moving" />
          live
        </span>
      </div>
      {events === undefined ? (
        <p className="px-5 text-small text-slate">Listening…</p>
      ) : events.length === 0 ? (
        <p className="px-5 text-small text-slate">
          Nothing has happened here yet. The first cn write shows up as it lands.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto px-2 [scrollbar-width:thin]">
          {events.map((event) => (
            <FeedEvent
              key={`${event.at} ${event.kind}`}
              event={event}
              now={now}
              landed={threshold !== undefined && event.at > threshold}
            />
          ))}
        </ul>
      )}
      <div className="px-5 pt-3 pb-4 text-small text-slate">
        <a href="/log" className="hover:text-ink">
          Open the log
        </a>
      </div>
    </aside>
  );
}
