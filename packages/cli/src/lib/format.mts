// format.mts: the lines cn prints. Every line naming an issue or epic starts with the
// reference form (ref.mts), so a list is readable a day later without looking anything
// up. The shapes come from the deployment's own return types, so a field that moves in
// the schema moves here at `vp check` rather than at runtime.

import type { api } from "@cairn/backend/convex/_generated/api.js";
import type { FunctionReturnType } from "convex/server";
import { type Referable, ref } from "./ref.mts";

/** What `cn show <id>` answers: an issue, an epic or a blocker. */
export type Shown = FunctionReturnType<typeof api.show.get>;

/** Enough of an issue to print one line of a list. */
export type IssueLineView = Referable & {
  status: string;
  priority: number;
  epic?: Referable;
  claimedBy?: { name: string };
  revision?: number;
};

/** A ready row: an issue line, plus what this session cannot satisfy. */
export type ReadyLineView = IssueLineView & { cannot: string[] };

/** One edge, as `edges.add` and `edges.remove` both answer. */
export type EdgeView = { type: string; from: Referable; to: Referable };

/** One `events` row, as the stale error and `cn show --history` both carry it. */
export type HistoryEvent = {
  at: number;
  actor: { name: string };
  kind: string;
  revision?: number;
  changes?: unknown;
};

/** Enough of a blocker to print one line of `cn waiting`. */
export type BlockerLineView = Referable & {
  blockerKind: string;
  owner: string;
  status: string;
  raisedAt: number;
  raisedBy: { name: string };
  resolvedAt?: number;
  resolvedBy?: { name: string };
};

/** Enough of an epic to print its health block: the counts, and the three lines of §8. */
export type EpicLineView = Referable & {
  counts: { open: number; inProgress: number; closed: number; followUps: number };
  lastReconciledAt?: number;
  health: {
    moving: (Referable & { claimedBy: { name: string }; claimedAt: number })[];
    stuck?: Referable & { lastActivity: number };
    waiting: (Referable & { owner: string })[];
  };
};

/** What `cn reconcile` answers: what it did on its own, and what it handed to a person. */
export type ReconcileView = FunctionReturnType<typeof api.reconcile.run>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago, in one token: `just now`, `5m`, `2h`, `3d`. */
export function age(sinceMs: number, now: number = Date.now()): string {
  const ms = Math.max(0, now - sinceMs);
  if (ms < MINUTE) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/**
 * `cn-1 "…" P0 open  ep-1 "…" · wsl/claude r3`
 *
 * The revision closes the line wherever the view carries one, so every list, create and
 * lifecycle line hands the agent the number its next write has to send. The issue rows
 * inside an epic's show do not carry it and print without.
 */
export function issueLine(view: IssueLineView): string {
  const parts = [`${ref(view)} P${view.priority} ${view.status}`];
  if (view.epic) parts.push(` ${ref(view.epic)}`);
  if (view.claimedBy) parts.push(`· ${view.claimedBy.name}`);
  if (view.revision !== undefined) parts.push(`r${view.revision}`);
  return parts.join(" ");
}

/**
 * The issue line, plus `· needs ios` where this session lacks what the issue requires.
 * Marked, never hidden: a wrong `can[]` must not be able to make work disappear (§5).
 */
export function readyLine(view: ReadyLineView): string {
  const line = issueLine(view);
  return view.cannot.length > 0 ? `${line} · needs ${view.cannot.join(", ")}` : line;
}

/**
 * One edge, read in the direction that makes it a sentence. Only one row is ever stored,
 * so `blocks` prints from its far end: `cn-2 "…" blocked by cn-1 "…"` is the row
 * `cn dep add cn-2 --blocked-by cn-1` wrote, read back the way it was asked for.
 */
export function edgeLine({ type, from, to }: EdgeView): string {
  if (type === "blocks") return `${ref(to)} blocked by ${ref(from)}`;
  const verb =
    type === "related" ? "related to" : type === "discovered-from" ? "discovered from" : type;
  return `${ref(from)} ${verb} ${ref(to)}`;
}

/**
 * `bl-1 "the App Store agreement" approval · owner balder · raised 5m ago by wsl/claude`
 *
 * The owner is the point of the line: a blocker is work only a person can do, so the
 * person is named before anything else about it. The tail is whichever end of its
 * lifecycle it is at — who raised it while it waits, who ended it once it is resolved —
 * and the status word is dropped where the tense already says it, so a raised blocker
 * reads `raised 5m ago` rather than `raised · raised 5m ago`.
 */
export function blockerLine(view: BlockerLineView, now: number = Date.now()): string {
  const { target, kind, tail } = blockerParts(view, now);
  return `${ref(target)} ${kind} · ${tail}`;
}

/**
 * A line in the pieces a surface with columns sets apart: what the line is about, the word
 * that classes it, and the rest of it as one run. Every `…Parts` below answers some shape
 * of this, and the `…Line` beside it is those pieces joined, so the web window's rows and
 * cn's lines cannot drift: apps/web pins each row's text to the line.
 */
export type BlockerParts = { target: Referable; kind: string; tail: string };

export function blockerParts(view: BlockerLineView, now: number = Date.now()): BlockerParts {
  const owner = `owner ${view.owner}`;
  const raised = `raised ${since(view.raisedAt, now)} by ${view.raisedBy.name}`;
  const tail =
    view.status === "resolved" && view.resolvedAt !== undefined && view.resolvedBy
      ? `${owner} · resolved ${since(view.resolvedAt, now)} by ${view.resolvedBy.name}`
      : view.status === "raised"
        ? `${owner} · ${raised}`
        : `${owner} · ${view.status} · ${raised}`;
  return { target: { id: view.id, title: view.title }, kind: view.blockerKind, tail };
}

/** `  holds  cn-4 "…", cn-7 "…"`: the issues a blocker keeps out of ready, under its line. */
export const holdsLine = (issues: Referable[]): string => `  holds  ${refs(issues)}`;

/**
 * An epic's health, as many lines as it has facts (docs/design.md §8):
 *
 * ```
 * ep-3 "An epic tells the truth"  2 done · 0 open · 1 follow-up · never reconciled
 *   moving   cn-7 "epic health and reconcile by hand" balder/claude 2h
 *   stuck    cn-9 "the reconcile sweep" silent 9d
 *   waiting  bl-3 "confirm the invite copy" · owner balder
 * ```
 *
 * Never a percentage: an epic at 95% frozen for a month reads better than one at 40%
 * advancing daily. A line with nothing behind it is not printed at all, so a fresh epic
 * is one line and the three that follow are only there when they say something.
 */
export function healthLines(view: EpicLineView, now: number = Date.now()): string[] {
  const { epic, counts, rows } = healthParts(view, now);
  return [
    `${ref(epic)}  ${counts}`,
    ...rows.map((row) => `  ${fact(row.fact)}${ref(row.target)} ${row.tail}`),
  ];
}

/** One fact of an epic's health: which of the three it is, what it names, and the rest. */
export type HealthRow = { fact: "moving" | "stuck" | "waiting"; target: Referable; tail: string };

/** The health block in pieces: the epic, its counts as one run, and a row per fact. */
export type HealthParts = { epic: Referable; counts: string; rows: HealthRow[] };

export function healthParts(view: EpicLineView, now: number = Date.now()): HealthParts {
  const { open, inProgress, closed, followUps } = view.counts;
  const reconciled =
    view.lastReconciledAt === undefined
      ? "never reconciled"
      : `last reconciled ${since(view.lastReconciledAt, now)}`;
  const rows: HealthRow[] = [];
  for (const issue of view.health.moving)
    rows.push({
      fact: "moving",
      target: issue,
      tail: `${issue.claimedBy.name} ${age(issue.claimedAt, now)}`,
    });
  if (view.health.stuck)
    rows.push({
      fact: "stuck",
      target: view.health.stuck,
      tail: `silent ${age(view.health.stuck.lastActivity, now)}`,
    });
  for (const blocker of view.health.waiting)
    rows.push({ fact: "waiting", target: blocker, tail: `· owner ${blocker.owner}` });
  return {
    epic: view,
    counts: `${closed} done · ${open + inProgress} open · ${followUps} ${
      followUps === 1 ? "follow-up" : "follow-ups"
    } · ${reconciled}`,
    rows,
  };
}

/**
 * What one `cn reconcile` run did, and what it could not decide:
 *
 * ```
 * ep-3 "An epic tells the truth" reconciled · did 2 · raised 1
 *   released    cn-7 "…" from wsl/claude, silent 25h
 *   dropped     cn-1 "…" blocks cn-2 "…"
 *   raised      bl-4 "same title? …" · owner balder
 * ```
 *
 * The owner is the verb's, not the run's: a raise is addressed to whoever `--owner` named,
 * and the answer carries the blockers rather than repeating the name on each of them.
 */
export function reconcileLines(
  result: ReconcileView,
  owner: string,
  now: number = Date.now(),
): string[] {
  const { did, raised } = result;
  const head =
    did.length === 0 && raised.length === 0
      ? `${ref(result.epic)} reconciled · nothing to do`
      : `${ref(result.epic)} reconciled · did ${did.length} · raised ${raised.length}`;
  const lines = [head];
  for (const entry of did) {
    if (entry.rule === "reparent")
      lines.push(`  ${rule("reparented")}${ref(entry.issue)} → ${ref(entry.to)}`);
    else if (entry.rule === "release")
      lines.push(
        `  ${rule("released")}${ref(entry.issue)} from ${entry.from.name}, silent ${age(
          now - entry.silentMs,
          now,
        )}`,
      );
    else if (entry.rule === "spawn-follow-up")
      lines.push(`  ${rule("spawned")}${ref(entry.followUp)} for ${ref(entry.issue)}`);
    else if (entry.rule === "drop-edge")
      lines.push(`  ${rule("dropped")}${ref(entry.from)} blocks ${ref(entry.to)}`);
    else lines.push(`  ${rule("closed")}${ref(entry.epic)}`);
  }
  for (const entry of raised)
    lines.push(`  ${rule("raised")}${ref(entry.blocker)} · owner ${owner}`);
  return lines;
}

/** The label column: the longest label is `discovered from`, and one space after it. */
const label = (name: string): string => name.padEnd(16);
/** The health block's column: `waiting` is the longest of the three, and two after it. */
const fact = (name: string): string => name.padEnd(9);
/** The reconcile block's column: `reparented` is the longest, and two after it. */
const rule = (name: string): string => name.padEnd(12);
const firstLine = (text: string): string => {
  const [head, ...rest] = text.split("\n");
  return rest.length > 0 && rest.join("").trim() !== "" ? `${head}…` : (head ?? "");
};
const refs = (items: Referable[]): string => items.map(ref).join(", ");
/** `2h ago`, but `just now` reads as itself. */
const since = (at: number, now: number): string => {
  const token = age(at, now);
  return token === "just now" ? token : `${token} ago`;
};

/** As much of one event's payload as belongs on a line. */
const CHANGES = 80;

const clip = (text: string): string =>
  text.length > CHANGES ? `${text.slice(0, CHANGES - 1)}…` : text;

/** A string prints as itself; anything else as its JSON, so `2 → 1` is not `"2" → "1"`. */
const side = (value: unknown): string =>
  value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value);

// `from` or `to`, not both: a value of undefined is not stored, so the first write of a
// field that had none comes back as `{ to }` alone.
const isFieldMap = (
  changes: unknown,
): changes is Record<string, { from?: unknown; to?: unknown }> =>
  typeof changes === "object" &&
  changes !== null &&
  !Array.isArray(changes) &&
  Object.values(changes).every(
    (v) => typeof v === "object" && v !== null && ("from" in v || "to" in v),
  );

/**
 * One event's payload in pieces: `priority 2 → 1` per field for the field-map shape, the
 * compact JSON as a single piece for anything else. Joined with `, ` they are what a line
 * has room for, so the cut is made here, inside the piece it lands in, and nothing a
 * reader of the pieces sees differs from what a reader of the line sees.
 */
export const changePieces = (changes: unknown): string[] => {
  if (changes === undefined) return [];
  if (!isFieldMap(changes)) {
    const text = clip(JSON.stringify(changes) ?? "");
    return text === "" ? [] : [text];
  }
  const pieces = Object.entries(changes).map(
    ([field, { from, to }]) => `${field} ${side(from)} → ${side(to)}`,
  );
  if (pieces.join(", ").length <= CHANGES) return pieces;
  const kept: string[] = [];
  let room = CHANGES - 1;
  for (const piece of pieces) {
    if (room <= 0) break;
    kept.push(piece.slice(0, room));
    room -= piece.length + 2;
  }
  kept[kept.length - 1] += "…";
  return kept;
};

const changesOf = (changes: unknown): string => changePieces(changes).join(", ");

/** `  r4  wsl/claude  2h ago  issue.update  priority 2 → 1` */
const eventLine = (e: HistoryEvent, now: number): string =>
  [
    "",
    e.revision === undefined ? "—" : `r${e.revision}`,
    e.actor.name,
    since(e.at, now),
    e.kind,
    changesOf(e.changes),
  ]
    .join("  ")
    .trimEnd();

/**
 * The events a rejected write came back with. A stale write is not a failure to report:
 * it is what changed, who changed it and when, so the agent re-reads and retries
 * (docs/design.md §9).
 */
export const staleLines = (data: { since?: HistoryEvent[] }, now: number = Date.now()): string[] =>
  (data.since ?? []).map((e) => eventLine(e, now));

/** The same lines, for `cn show <id> --history`. */
export const historyLines = (events: HistoryEvent[], now: number = Date.now()): string[] =>
  events.map((e) => eventLine(e, now));

/** What `cn log` lists: one event, with whatever it names resolved to id and title. */
export type LogEvent = FunctionReturnType<typeof api.events.recent>[number];

/**
 * `cn-2 "scratch: second"  issue.claim  wsl/claude  2h ago  status open → in_progress, …`
 *
 * The target leads because that is what happened to, an issue first since an event that
 * names both an issue and its blocker is about the issue; a create prints no payload,
 * because the reference at the start of the line already names what was created.
 */
export function logLine(e: LogEvent, now: number = Date.now()): string {
  const { target, kind, actor, when, changes } = logParts(e, now);
  return [target ? ref(target) : "—", kind, actor, when, changes.join(", ")].join("  ").trimEnd();
}

/** One event in pieces: a target where it names one, and its payload a change at a time. */
export type LogParts = {
  target?: Referable;
  kind: string;
  actor: string;
  when: string;
  changes: string[];
};

export function logParts(e: LogEvent, now: number = Date.now()): LogParts {
  return {
    target: e.issue ?? e.blocker ?? e.epic,
    kind: e.kind,
    actor: e.actor.name,
    when: since(e.at, now),
    changes: e.kind.endsWith(".create") ? [] : changePieces(e.changes),
  };
}

/** The ten-line brief of `cn show`, one shape per kind. */
export function brief(shown: Shown, now: number = Date.now()): string {
  if (shown.kind === "epic") {
    const lines = healthLines(shown, now);
    if (shown.description) lines.push(shown.description);
    lines.push(...shown.issues.map((i) => `  ${issueLine(i)}`));
    return lines.join("\n");
  }
  if (shown.kind === "blocker") {
    const lines = [
      ref(shown),
      `${label("kind")}${shown.blockerKind} · owner ${shown.owner}`,
      // `raised raised 2m ago` says it twice, so the status word goes where it adds one.
      `${label("status")}${shown.status === "raised" ? "" : `${shown.status} · `}raised ${since(shown.raisedAt, now)} by ${shown.raisedBy.name}`,
      `${label("resolves when")}${shown.whatResolves}`,
    ];
    // The date alone: a nudge is a day somebody looks again, and the hour is noise.
    if (shown.nudgeAt !== undefined)
      lines.push(`${label("nudge")}${new Date(shown.nudgeAt).toISOString().slice(0, 10)}`);
    if (shown.resolvedBy && shown.resolvedAt !== undefined)
      lines.push(
        `${label("resolved")}by ${shown.resolvedBy.name} ${since(shown.resolvedAt, now)}: ${shown.resolution ?? ""}`,
      );
    if (shown.issues.length > 0) lines.push(`${label("holds")}${refs(shown.issues)}`);
    if (shown.events && shown.events.length > 0) {
      lines.push("history");
      lines.push(...historyLines(shown.events, now));
    }
    return lines.join("\n");
  }

  const lines = [
    ref(shown),
    `${label("epic")}${ref(shown.epic)}`,
    `${label("project")}${shown.project}`,
    `${label("status")}${shown.status} · P${shown.priority} · created ${since(shown.createdAt, now)} · revision ${shown.revision}`,
  ];
  if (shown.claimedBy)
    lines.push(
      `${label("claimed")}${shown.claimedBy.name}${
        shown.claimedAt === undefined ? "" : ` · ${age(shown.claimedAt, now)}`
      }`,
    );
  if (shown.requires.length > 0) lines.push(`${label("requires")}${shown.requires.join(", ")}`);
  if (shown.parent) lines.push(`${label("parent")}${ref(shown.parent)}`);
  if (shown.followUps.length > 0) lines.push(`${label("follow-ups")}${refs(shown.followUps)}`);
  if (shown.blocks.length > 0) lines.push(`${label("blocks")}${refs(shown.blocks)}`);
  if (shown.blockedBy.length > 0) lines.push(`${label("blocked by")}${refs(shown.blockedBy)}`);
  // The context edges after the blocking ones: they say where an issue came from and what
  // it sits beside, and none of them touches readiness (design §3).
  if (shown.related.length > 0) lines.push(`${label("related")}${refs(shown.related)}`);
  if (shown.discoveredFrom.length > 0)
    lines.push(`${label("discovered from")}${refs(shown.discoveredFrom)}`);
  if (shown.duplicates.length > 0) lines.push(`${label("duplicates")}${refs(shown.duplicates)}`);
  if (shown.supersedes.length > 0) lines.push(`${label("supersedes")}${refs(shown.supersedes)}`);
  if (shown.waitingOn.length > 0) lines.push(`${label("waiting on")}${refs(shown.waitingOn)}`);
  if (shown.design) lines.push(`${label("design")}${firstLine(shown.design)}`);
  if (shown.acceptance) lines.push(`${label("acceptance")}${firstLine(shown.acceptance)}`);
  if (shown.journal.length > 0) {
    lines.push("journal");
    for (const e of shown.journal)
      lines.push(`  ${age(e.at, now)} ${e.author.name} ${e.kind}: ${e.body}`);
  }
  if (shown.events && shown.events.length > 0) {
    lines.push("history");
    lines.push(...historyLines(shown.events, now));
  }
  return lines.join("\n");
}

/** What `cn brief` answers: the counts and the heads of design §8. */
export type BriefView = FunctionReturnType<typeof api.brief.get>;

/** Where this session is, for the brief's first line. */
export type BriefWhere = { deployment: string; actor: string; can: string[] };

/** As many rows as a glance holds, then `+N more`. */
const capped = (rows: string[], cap: number): string =>
  rows.length > cap
    ? `${rows.slice(0, cap).join(" · ")} · +${rows.length - cap} more`
    : rows.join(" · ");

const IN_PROGRESS_CAP = 5;
const FOLLOW_UP_CAP = 3;

/**
 * The situation report, at most six lines (docs/design.md §8):
 *
 * ```
 * cairn · invyte · wsl/claude can web
 * ready 4         app-31 "retry on reconnect" P1 · app-40 "…" P2
 * in progress     app-14 "fix connection retry" wsl/claude 2h
 * follow-ups      app-22 "confirm the retry path" [verify] · 1 more needs what you lack
 * waiting on you  3
 * flagged         2
 * ```
 *
 * State, never doctrine: the rules are in the skill, which loads on demand, and a hook
 * always loads. The follow-ups line is the one place a capability list subtracts rather
 * than marks, and it says how many it left out, because `cn ready` is where every row
 * lives and none of them is ever hidden there.
 */
export function briefLines(view: BriefView, where: BriefWhere, now: number = Date.now()): string[] {
  const head = `cairn · ${where.deployment} · ${where.actor}`;
  const lines = [where.can.length > 0 ? `${head} can ${where.can.join(" ")}` : head];

  const ready = view.ready.top.map((i) => {
    const line = `${ref(i)} P${i.priority}`;
    return i.cannot.length > 0 ? `${line} · needs ${i.cannot.join(", ")}` : line;
  });
  lines.push(
    // The head is three at the deployment, so there is nothing left to cap here.
    `${label(`ready ${view.ready.count}`)}${view.ready.count === 0 ? "none" : ready.join(" · ")}`,
  );

  const holding = view.inProgress.map((i) =>
    [ref(i), i.claimedBy?.name, i.claimedAt === undefined ? undefined : age(i.claimedAt, now)]
      .filter((part): part is string => part !== undefined)
      .join(" "),
  );
  lines.push(
    `${label("in progress")}${holding.length === 0 ? "none" : capped(holding, IN_PROGRESS_CAP)}`,
  );

  const covered = view.followUps.covered.map(
    (f) => `${ref(f)}${f.followUpKind === undefined ? "" : ` [${f.followUpKind}]`}`,
  );
  const hidden = view.followUps.count - view.followUps.covered.length;
  const followUps =
    view.followUps.count === 0
      ? "none"
      : [
          capped(covered, FOLLOW_UP_CAP),
          hidden > 0
            ? `${hidden} more ${hidden === 1 ? "needs" : "need"} what you lack`
            : undefined,
        ]
          .filter((part): part is string => part !== undefined && part !== "")
          .join(" · ");
  lines.push(`${label("follow-ups")}${followUps}`);

  lines.push(`${label("waiting on you")}${view.waiting}`);
  if (view.flagged > 0) lines.push(`${label("flagged")}${view.flagged}`);
  return lines;
}
