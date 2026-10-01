// projects.ts: the Projects pages' own words, beside brief.ts's, and the chart's arithmetic.
// The headline says per project the one thing to know, in the order projectWord ranks them,
// a clause with nothing behind it marked `empty` so the page sets it back; the state line
// and the counts line say the same of one project with room. Every fact read here is one
// the deployment answered: an issue is stuck because its project's health names it, and
// waiting because a blocker on the list holds it. The chart's scale is here rather than in
// the component so a test can hold it, and the dots are placed in percent, which renders to
// a string with no element to measure.
import { PULSE_DAYS } from "@cairn/backend/convex/lib/thresholds.js";
import { type Referable, ref } from "@cairn/cli/ref";
import { DAY, HOUR, age } from "@cairn/cli/time";
import type { ProjectView } from "@cairn/cli/views";
import type { WaitingBlocker } from "./Overview.tsx";
import type { Listed } from "./rows.tsx";
import { type Tone, projectWord } from "./tone.tsx";

/**
 * The pulse a project is drawn with before the list that carries pulses has answered: the
 * rail's list leaves it out, and until the Overview's or the Projects routes' own
 * subscription lands, every day reads quiet.
 */
export const NO_PULSE: { events: number; closes: number }[] = Array.from(
  { length: PULSE_DAYS },
  () => ({ events: 0, closes: 0 }),
);

/** The events or the closes of a pulse, over its 28 days. */
export const pulseTotal = (
  pulse: NonNullable<ProjectView["pulse"]>,
  of: "events" | "closes",
): number => pulse.reduce((total, day) => total + day[of], 0);

/** The most events any one day of the pulse had, the height every bar beside it is drawn against. */
export const pulseMost = (pulse: NonNullable<ProjectView["pulse"]>): number =>
  Math.max(0, ...pulse.map((d) => d.events));

/** What a project has live: open and in progress, and the follow-ups beside them. */
export const liveOf = (
  counts: Pick<ProjectView["counts"], "open" | "inProgress" | "followUps">,
): number => counts.open + counts.inProgress + counts.followUps;

/** What a dot on the chart says of its issue. */
export type Mark = "moving" | "waiting" | "stuck" | "open";

export const toneOfMark = (m: Mark): Tone => (m === "open" ? "still" : m);

/** Each issue a blocker on the list holds, and the blocker holding it; the first listed wins. */
export function heldBy(blockers: WaitingBlocker[]): Map<string, Referable> {
  const held = new Map<string, Referable>();
  for (const blocker of blockers)
    for (const issue of blocker.issues)
      if (!held.has(issue.id)) held.set(issue.id, { id: blocker.id, title: blocker.title });
  return held;
}

/** The project's live issues, open or in progress, in the order given. */
export const liveIn = (issues: Listed[], slug: string): Listed[] =>
  issues.filter((i) => i.project === slug && (i.status === "open" || i.status === "in_progress"));

/** The project's issues closed in the last 28 days, the newest close first. */
export const closedIn = (issues: Listed[], slug: string, now: number): Listed[] =>
  issues
    .filter(
      (i) =>
        i.project === slug &&
        i.status === "closed" &&
        i.closedAt !== undefined &&
        now - i.closedAt <= 28 * DAY,
    )
    .sort((a, b) => b.closedAt! - a.closedAt!);

/** What a live issue is: claimed is moving, held is waiting, named in its project's health is stuck. */
export function markOf(issue: Listed, project: ProjectView, held: Map<string, Referable>): Mark {
  if (issue.status === "in_progress") return "moving";
  if (held.has(issue.id)) return "waiting";
  if (project.health.stuck.some((s) => s.id === issue.id)) return "stuck";
  return "open";
}

const RANK: Record<string, number> = {
  waiting: 0,
  stuck: 1,
  moving: 2,
  "nothing moving": 3,
  "nothing filed": 4,
};

/** The projects most pressing first, then the most live, then by slug. */
export const orderProjects = (projects: ProjectView[]): ProjectView[] =>
  [...projects].sort(
    (a, b) =>
      RANK[projectWord(a)]! - RANK[projectWord(b)]! ||
      liveOf(b.counts) - liveOf(a.counts) ||
      a.slug.localeCompare(b.slug),
  );

/** A run of words, tinted where it names a state. */
export type Piece = { text: string; tone?: Tone };

/** One project's clause of the headline: its slug, then the words after it. */
export type ProjectClause = { slug: string; pieces: Piece[]; empty: boolean };

/** The one thing to know of a project, in projectWord's precedence. */
export function clauseOf(p: ProjectView): ProjectClause {
  const n = p.health.stuck.length;
  const clause = (pieces: Piece[], empty = false): ProjectClause => ({
    slug: p.slug,
    pieces,
    empty,
  });
  const stuck: Piece = { text: `${n} stuck`, tone: "stuck" };
  const moving: Piece = { text: "moving", tone: "moving" };
  if (p.filed === 0) return clause([{ text: " has nothing filed." }], true);
  if (p.health.waiting.length > 0)
    return clause([{ text: " " }, { text: "waits on you", tone: "waiting" }, { text: "." }]);
  if (p.health.moving.length > 0 && n > 0)
    return clause([{ text: " is " }, moving, { text: ", with " }, stuck, { text: "." }]);
  if (p.health.moving.length > 0) return clause([{ text: " is " }, moving, { text: "." }]);
  if (n > 0) return clause([{ text: " has " }, stuck, { text: "." }]);
  return clause([{ text: " is quiet." }], true);
}

/** A clause as the words it reads as. */
export const clauseText = (c: ProjectClause): string =>
  c.slug + c.pieces.map((x) => x.text).join("");

/** The line under the headline: what is live across every project, and what closed. */
export function subline(projects: ProjectView[]): string {
  const live = projects.reduce((sum, p) => sum + liveOf(p.counts), 0);
  const closes = projects.reduce(
    (sum, p) => sum + (p.pulse ?? NO_PULSE).reduce((days, day) => days + day.closes, 0),
    0,
  );
  const n = projects.length;
  return `${live} live ${live === 1 ? "issue" : "issues"} in ${n} ${
    n === 1 ? "project" : "projects"
  } · ${closes} closed in the last 4 weeks`;
}

/** A project's page's state line: what is moving, stuck and waiting on you, each said even at none. */
export function stateLine(p: ProjectView): Piece[] {
  if (p.filed === 0) return [{ text: "Nothing filed yet.", tone: "still" }];
  const say = (count: number, some: string, none: string, tone: Tone): Piece =>
    count > 0 ? { text: `${count} ${some}`, tone } : { text: none, tone: "still" };
  const [first, second, third] = [
    say(p.health.moving.length, "moving", "nothing moving", "moving"),
    say(p.health.stuck.length, "stuck", "nothing stuck", "stuck"),
    say(p.health.waiting.length, "waiting on you", "nothing waiting on you", "waiting"),
  ];
  // The separators are pieces of their own, with no tone: a comma in teal reads as a smudge.
  return [
    { ...first, text: first.text[0]!.toUpperCase() + first.text.slice(1) },
    { text: ", " },
    second,
    { text: ", " },
    third,
    { text: "." },
  ];
}

/** A project's page's counts line, over its live issues and its closes of the last four weeks. */
export function countsLine(live: Listed[], closed: Listed[]): string {
  const open = live.filter((i) => i.status === "open").length;
  const inProgress = live.filter((i) => i.status === "in_progress").length;
  const epics = new Set(live.map((i) => i.epic.id)).size;
  return `${open} open · ${inProgress} in progress · ${closed.length} closed in the last 4 weeks · across ${epics} ${
    epics === 1 ? "epic" : "epics"
  }`;
}

/** Where the counts line stands on the page of a project nothing is filed under. */
export const NOTHING_FILED =
  "Once something is filed under it, it shows here and in its lane on Projects.";

/** The chart's right edge: an issue silent this long or longer sits at it. */
export const HORIZON = 45 * DAY;

/** Where a silence sits across the chart, 0 to 1, on a log scale with three days at about the middle. */
export const xOf = (silentMs: number): number =>
  Math.min(
    1,
    Math.max(0, Math.log(1 + silentMs / (6 * HOUR)) / Math.log(1 + HORIZON / (6 * HOUR))),
  );

/** The axis: each tick's silence and its word. */
export const TICKS: [number, string][] = [
  [0, "now"],
  [DAY, "1d"],
  [3 * DAY, "3d"],
  [7 * DAY, "1w"],
  [14 * DAY, "2w"],
  [30 * DAY, "1mo"],
];

/** The legend's words for STUCK_AFTER_MS, which projects.test.ts holds beside it. */
export const STUCK_RULE = "stuck past: P0 a day, P1 3 days, P2 a week; P3 and P4 never";

/** A dot where it goes: across in percent, down in pixels. */
export type Placed = { issue: Listed; mark: Mark; x: number; y: number };

/** The slots a dot tries in its priority's band, in order: its line, then above and below it. */
const SLOTS = [0, -1, 1, -2, 2];

/**
 * Every issue a dot: across by how long since it moved, down by its priority, and nudged
 * off its line within the band where the dot before it on that line is nearer than `gap`
 * percent. The quietest are placed last, so the nudge falls on them.
 */
export function placeDots(
  issues: Listed[],
  marks: Map<string, Mark>,
  now: number,
  rowH: number,
  d: number,
  gap = 1.6,
): Placed[] {
  const last = new Map<string, number>();
  return [...issues]
    .sort((a, b) => now - a.lastActivity - (now - b.lastActivity))
    .map((issue) => {
      const x = xOf(now - issue.lastActivity) * 100;
      const slot =
        SLOTS.find((s) => {
          const before = last.get(`${issue.priority}:${s}`);
          return before === undefined || x - before >= gap;
        }) ?? 0;
      last.set(`${issue.priority}:${slot}`, x);
      return {
        issue,
        mark: marks.get(issue.id) ?? "open",
        x: Math.min(99, Math.max(1, x)),
        y: issue.priority * rowH + rowH / 2 + slot * Math.min(d * 0.55, rowH * 0.3),
      };
    });
}

/** A dot's tooltip: the issue in the reference form, its priority and epic, and what it is. */
export function tipOf(
  issue: Listed,
  mark: Mark,
  holder: Referable | undefined,
  now: number,
): string {
  const quiet = age(issue.lastActivity, now);
  const what =
    mark === "moving"
      ? issue.claimedBy
        ? `moving · ${issue.claimedBy.name} ${quiet}`
        : `moving · ${quiet}`
      : mark === "waiting" && holder
        ? `waiting on ${holder.id} · silent ${quiet}`
        : `${mark} · silent ${quiet}`;
  return `${ref(issue)} · P${issue.priority} · ${issue.epic.id} · ${what}`;
}

/** A link's URL as a chip prints it: no scheme, no trailing slash. */
export const shown = (url: string): string =>
  url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/$/, "");
