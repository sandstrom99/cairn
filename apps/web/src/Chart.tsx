// Chart.tsx: the Projects pages' drawings. The chart is every live issue a dot, across by
// how long since it last moved and down by its priority, with each priority's limit from
// thresholds.ts drawn as the zone a dot is in once it is stuck; the pulse is the 28 days
// `projects.list` carries, a bar a day with the closes in ink at its foot; the strips are
// one dot per live issue under each epic; the meter is one issue's silence against its
// limit. Each draws what the deployment answered and decides nothing: a dot's colour is the
// mark projects.ts read off the project's health and the blockers.
//
// None of them is a row, so none holds an `li`, and none holds cn's words except in a
// `title`, an `aria-label` or a `data-tip`: the chart's axis, lane labels and legend are the
// page's own. They render to a string with no state and measure nothing, which is why a dot
// is placed in percent (placeDots) and its tooltip is CSS (index.css, `.pt`).
import { STUCK_AFTER_MS } from "@cairn/backend/convex/lib/thresholds.js";
import { type Referable, ref } from "@cairn/cli/ref";
import type { ProjectView } from "@cairn/cli/views";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { type Mark, STUCK_RULE, TICKS, placeDots, tipOf, toneOfMark, xOf } from "./projects.ts";
import { Ref } from "./Ref.tsx";
import type { Listed } from "./rows.tsx";
import { Dot, type Tone, projectWord, toneOf } from "./tone.tsx";

/** One project's lane: its live issues, what each is, and the blockers holding them. */
export type Lane = {
  project: ProjectView;
  issues: Listed[];
  marks: Map<string, Mark>;
  held: Map<string, Referable>;
};

const PRIORITIES = [0, 1, 2, 3, 4];

/** The stuck zone, in the chart and in its legend. */
const ZONE = "bg-stuck/9 border-l-[1.5px] border-dashed border-stuck/55";

/**
 * The chart and its legend. `solo` is one project's own page: one lane with room, taller
 * bands and larger dots, and no label but the priorities.
 */
export function Chart({
  lanes,
  now,
  solo = false,
}: {
  lanes: Lane[];
  now: number;
  solo?: boolean;
}) {
  const rowH = solo ? 30 : 13;
  const d = solo ? 11 : 8;
  const grid = solo
    ? "grid grid-cols-[22px_minmax(0,1fr)] gap-x-2.5"
    : "grid grid-cols-[96px_minmax(0,1fr)] gap-x-3.5 narrow:grid-cols-[58px_minmax(0,1fr)] narrow:gap-x-2";
  return (
    <>
      <div className="chart px-[18px] pt-3.5 pb-1.5 narrow:px-3">
        <div className={grid} aria-hidden="true">
          <span />
          <div className="relative h-[18px]">
            {TICKS.map(([at, label], k) => (
              <span
                key={label}
                className={cn(
                  "absolute top-0 text-micro whitespace-nowrap text-faint",
                  k > 0 && "-translate-x-1/2",
                )}
                style={{ left: `${xOf(at) * 100}%` }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
        {lanes.map((lane, k) => (
          <div
            key={lane.project.slug}
            className={cn(grid, "py-2.5", k > 0 && "border-t border-hair")}
          >
            <LaneLabel lane={lane} height={rowH * 5} solo={solo} />
            <Plot lane={lane} now={now} rowH={rowH} d={d} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 border-t border-hair px-[18px] py-2.5 text-meta text-slate">
        {(
          [
            ["moving", "moving"],
            ["waiting", "waiting on you"],
            ["stuck", "stuck"],
            ["still", "open"],
          ] as const
        ).map(([tone, word]) => (
          <span key={word} className="inline-flex items-center gap-[7px]">
            <Dot tone={tone} />
            {word}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-[7px] narrow:ml-0">
          <i className={cn("h-2.5 w-4 rounded-sm", ZONE)} />
          {STUCK_RULE}
        </span>
      </div>
    </>
  );
}

/** P0 to P4, each in its band. */
function Priorities({ height, className }: { height: number; className?: string }) {
  return (
    <span
      className={cn(
        "grid grid-rows-5 items-center text-right font-mono text-[9.5px] leading-none text-faint",
        className,
      )}
      style={{ height }}
    >
      {PRIORITIES.map((p) => (
        <span key={p}>P{p}</span>
      ))}
    </span>
  );
}

function LaneLabel({ lane, height, solo }: { lane: Lane; height: number; solo: boolean }) {
  if (solo) return <Priorities height={height} />;
  const { project, issues } = lane;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] content-start gap-x-1.5">
      <span className="inline-flex items-center gap-2">
        <Dot tone={toneOf(projectWord(project))} />
        <a
          href={`/projects/${project.slug}`}
          className="font-mono text-[14px] font-semibold decoration-faint underline-offset-[3px] hover:underline"
        >
          {project.slug}
        </a>
      </span>
      <span className="col-start-1 pl-4 text-meta text-slate narrow:col-span-2 narrow:pl-0">
        {issues.length > 0 ? `${issues.length} live` : "none"}
      </span>
      <Priorities height={height} className="col-start-2 row-span-3 row-start-1 narrow:hidden" />
    </div>
  );
}

function Plot({ lane, now, rowH, d }: { lane: Lane; now: number; rowH: number; d: number }) {
  const { project, issues, marks, held } = lane;
  return (
    <div className="relative" style={{ height: rowH * 5 }}>
      {PRIORITIES.slice(1).map((r) => (
        <i
          key={`band ${r}`}
          className="absolute inset-x-0 border-t border-dotted border-ink/7"
          style={{ top: r * rowH }}
        />
      ))}
      {TICKS.slice(1).map(([at, label]) => (
        <i
          key={`grid ${label}`}
          className="absolute inset-y-0 w-0 border-l border-ink/5"
          style={{ left: `${xOf(at) * 100}%` }}
        />
      ))}
      {PRIORITIES.map((p) => {
        const limit = STUCK_AFTER_MS[p];
        if (limit === undefined) return null;
        return (
          <i
            key={`zone ${p}`}
            className={cn("absolute right-0", ZONE)}
            style={{ left: `${xOf(limit) * 100}%`, top: p * rowH, height: rowH }}
          />
        );
      })}
      {issues.length === 0 && (
        <span className="absolute inset-0 grid place-items-center text-small text-faint">
          {project.filed === 0 ? "nothing filed yet" : "nothing live"}
        </span>
      )}
      {placeDots(issues, marks, now, rowH, d).map(({ issue, mark, x, y }) => {
        const tip = tipOf(issue, mark, held.get(issue.id), now);
        return (
          <a
            key={issue.id}
            href={`/${issue.id}`}
            className={cn("pt", mark !== "open" && mark)}
            style={{ left: `${x}%`, top: `${y}px`, "--d": `${d}px` } as CSSProperties}
            data-tip={tip}
            data-edge={x < 30 ? "start" : x > 70 ? "end" : undefined}
            aria-label={tip}
          />
        );
      })}
    </div>
  );
}

/**
 * The last 28 days, a bar each, oldest first. A bar's whole height is the day's events, the
 * closes among them in ink at its foot; a day with none is a hairline. `max` is the most
 * events any pulse shown beside this one has, so bars compare across projects.
 */
export function Pulse({
  pulse,
  height,
  max,
  caps,
}: {
  pulse: ProjectView["pulse"];
  height: number;
  max: number;
  caps: string[];
}) {
  const last = pulse.length - 1;
  return (
    <>
      <div className="flex items-end gap-0.5" style={{ height }}>
        {pulse.map(({ events, closes }, k) => {
          const when = k === last ? "today" : `${last - k}d ago`;
          const title = `${when}: ${events} ${events === 1 ? "event" : "events"}${
            closes > 0 ? `, ${closes} closed` : ""
          }`;
          const rest = events - closes;
          return (
            <i key={k} className="flex h-full min-w-0 flex-1 flex-col-reverse" title={title}>
              {events === 0 || max === 0 ? (
                <b className="block h-0.5 rounded-[1.5px] bg-ink/8" />
              ) : (
                <>
                  {closes > 0 && (
                    <b
                      className="block rounded-[1.5px] bg-ink"
                      style={{ height: (closes / max) * height }}
                    />
                  )}
                  {rest > 0 && (
                    <b
                      className="mt-px block rounded-[1.5px] bg-ink/20"
                      style={{ height: (rest / max) * height }}
                    />
                  )}
                </>
              )}
            </i>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-micro text-faint">
        {caps.map((cap) => (
          <span key={cap}>{cap}</span>
        ))}
      </div>
    </>
  );
}

/**
 * Where the work is: a line per epic, the one with the most live issues first, and a dot per
 * issue in it, most urgent and longest quiet first, its title the reference form.
 */
export function Strips({
  issues,
  marks,
  wide = false,
}: {
  issues: Listed[];
  marks: Map<string, Mark>;
  wide?: boolean;
}) {
  const epics = new Map<string, { epic: Referable; issues: Listed[] }>();
  for (const issue of issues) {
    const strip = epics.get(issue.epic.id) ?? { epic: issue.epic, issues: [] };
    strip.issues.push(issue);
    epics.set(issue.epic.id, strip);
  }
  const strips = [...epics.values()].sort(
    (a, b) => b.issues.length - a.issues.length || a.epic.id.localeCompare(b.epic.id),
  );
  return (
    <div className="grid gap-[3px]">
      {strips.map(({ epic, issues: under }) => (
        <div
          key={epic.id}
          className={cn(
            "grid min-h-5 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 text-meta",
            wide && "py-1.5 text-small",
          )}
        >
          <Ref item={epic} clip />
          <span
            className={cn(
              "flex max-w-[190px] flex-wrap justify-end gap-[3px]",
              wide && "max-w-[280px]",
            )}
          >
            {[...under]
              .sort((a, b) => a.priority - b.priority || a.lastActivity - b.lastActivity)
              .map((issue) => (
                <Dot
                  key={issue.id}
                  tone={toneOfMark(marks.get(issue.id) ?? "open")}
                  title={ref(issue)}
                  className={wide ? "size-[9px]" : "size-[7px]"}
                />
              ))}
          </span>
        </div>
      ))}
    </div>
  );
}

const FILL: Record<Tone, string> = {
  moving: "bg-moving",
  stuck: "bg-stuck",
  waiting: "bg-waiting",
  still: "bg-ink/32",
};

/** One issue's silence on the chart's scale, in its tone, with its priority's limit ticked where it has one. */
export function Meter({
  silentMs,
  limit,
  tone,
  title,
}: {
  silentMs: number;
  limit: number | undefined;
  tone: Tone;
  title?: string;
}) {
  return (
    <span className="relative block h-1 w-14 rounded-sm bg-ink/7" title={title}>
      <b
        className={cn("absolute inset-y-0 left-0 rounded-sm", FILL[tone])}
        style={{ width: `${xOf(silentMs) * 100}%` }}
      />
      {limit !== undefined && (
        <i
          className="absolute -inset-y-0.5 w-[1.5px] bg-stuck/70"
          style={{ left: `${xOf(limit) * 100}%` }}
        />
      )}
    </span>
  );
}
