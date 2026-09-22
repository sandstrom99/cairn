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
  const { target, priority, status, epic, claimedBy, revision } = issueParts(view);
  const parts = [`${ref(target)} ${priority} ${status}`];
  if (epic) parts.push(` ${ref(epic)}`);
  if (claimedBy) parts.push(`· ${claimedBy}`);
  if (revision) parts.push(revision);
  return parts.join(" ");
}

/** The issue line in pieces, each already the token the line prints: `P2`, `r3`. */
export type IssueParts = {
  target: Referable;
  priority: string;
  status: string;
  epic?: Referable;
  claimedBy?: string;
  revision?: string;
};

export function issueParts(view: IssueLineView): IssueParts {
  return {
    target: { id: view.id, title: view.title },
    priority: `P${view.priority}`,
    status: view.status,
    epic: view.epic,
    claimedBy: view.claimedBy?.name,
    revision: view.revision === undefined ? undefined : `r${view.revision}`,
  };
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
/** A reference with a word after it where the thing named is not what it was: `cn-6 "…" done`. */
export type Named = Referable & { tail?: string };

const named = (item: Named): string => (item.tail ? `${ref(item)} ${item.tail}` : ref(item));
const refs = (items: Named[]): string => items.map(named).join(", ");
/** The date alone, `2026-10-01`: a day somebody looks again, where the hour is noise. */
const day = (at: number): string => new Date(at).toISOString().slice(0, 10);
/** `2h ago`, but `just now` reads as itself. */
export const since = (at: number, now: number): string => {
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

/** The word an edge type reads as, from its `from` end: `cn-1 blocks cn-2`. */
const EDGE_VERB: Record<string, string> = {
  blocks: "blocks",
  related: "related to",
  "discovered-from": "discovered from",
  duplicates: "duplicates",
  supersedes: "supersedes",
};

/**
 * One edge as the piece of a line that already names one of its ends, `self`: `blocks
 * cn-2` from the `from` end, `blocked by cn-1` from the `to` end, `related to` either way.
 * A directed type read from its `to` end, and a line that names neither end, get the
 * whole sentence, `cn-3 discovered from cn-1`, the way `edgeLine` reads it.
 */
const edgePiece = (
  { type, from, to }: { type: string; from: string; to: string },
  self: string | undefined,
): string => {
  const verb = EDGE_VERB[type] ?? type;
  if (self === from) return `${verb} ${to}`;
  if (self === to && type === "blocks") return `blocked by ${from}`;
  if (self === to && type === "related") return `related to ${from}`;
  return type === "blocks" ? `${to} blocked by ${from}` : `${from} ${verb} ${to}`;
};

const isEdgeChanges = (changes: unknown): changes is { type: string; from: string; to: string } =>
  typeof changes === "object" &&
  changes !== null &&
  typeof (changes as { type?: unknown }).type === "string" &&
  typeof (changes as { from?: unknown }).from === "string" &&
  typeof (changes as { to?: unknown }).to === "string";

const isJournalChanges = (changes: unknown): changes is { kind: string; body: string } =>
  typeof changes === "object" &&
  changes !== null &&
  typeof (changes as { kind?: unknown }).kind === "string" &&
  typeof (changes as { body?: unknown }).body === "string";

/** `changes` is an object whose named fields are all strings, whatever else it carries. */
const hasStrings = <K extends string>(
  changes: unknown,
  ...keys: K[]
): changes is Record<K, string> =>
  typeof changes === "object" &&
  changes !== null &&
  keys.every((key) => typeof (changes as Record<string, unknown>)[key] === "string");

/** `changes` is an object whose named fields are all arrays, whatever else it carries. */
const hasArrays = <K extends string>(
  changes: unknown,
  ...keys: K[]
): changes is Record<K, unknown[]> =>
  typeof changes === "object" &&
  changes !== null &&
  keys.every((key) => Array.isArray((changes as Record<string, unknown>)[key]));

/**
 * A raise, the way `blockerLine` opens: `bl-3 "…" decision · owner balder`, on the line of
 * the issue it was raised on. Read from the blocker's own history the reference is the
 * page, so the piece names the issue it holds instead, and read from nobody's it carries
 * both ends, the way an edge does.
 */
const raisePiece = (
  c: Record<"id" | "blockerKind" | "owner" | "title" | "issue", string>,
  self: string | undefined,
): string => {
  const what = `${c.blockerKind} · owner ${c.owner}`;
  const head = self === c.id ? what : `${ref({ id: c.id, title: c.title })} ${what}`;
  return self === c.issue ? head : `${head} · holds ${c.issue}`;
};

/** One more issue a blocker holds: `waits on bl-3` from the issue, `holds cn-18` from the blocker. */
const attachPiece = (
  { blocker, issue }: Record<"blocker" | "issue", string>,
  self: string | undefined,
) =>
  self === blocker
    ? `holds ${issue}`
    : self === issue
      ? `waits on ${blocker}`
      : `${issue} waits on ${blocker}`;

/** What `reconcileLines` heads with, and who asked: `did 2 · raised 1 · by balder/claude`. */
const runPiece = ({ by, did, raised }: { by: string; did: unknown[]; raised: unknown[] }) =>
  `${did.length === 0 && raised.length === 0 ? "nothing to do" : `did ${did.length} · raised ${raised.length}`} · by ${by}`;

/**
 * One event's payload in pieces, by its kind. A journal append is `finding: <its first
 * line>`, the way `cn show` lists the entry; an edge is `edgePiece` relative to `self`,
 * the issue the line is about, and a blocker's raise and attach read relative to it the
 * same way; the resolve recorded on each issue a blocker held is the blocker and the note,
 * `bl-3 "…": done`; a reconcile run is the head of `reconcileLines` and who asked, a sweep
 * how many epics it visited and for whom. A create has no payload, because the reference
 * at the start of its line already names what was created, except a project, which has no
 * reference to lead with and so is its slug and name here. Anything else is `changePieces`.
 */
export const eventPieces = (kind: string, changes: unknown, self: string | undefined): string[] => {
  if (kind === "project.create" && hasStrings(changes, "slug", "name"))
    return [clip(ref({ id: changes.slug, title: changes.name }))];
  if (kind.endsWith(".create")) return [];
  if (kind === "journal.append" && isJournalChanges(changes))
    return [clip(`${changes.kind}: ${firstLine(changes.body)}`)];
  if (kind.startsWith("edge.") && isEdgeChanges(changes)) return [edgePiece(changes, self)];
  if (
    kind === "blocker.raise" &&
    hasStrings(changes, "id", "blockerKind", "owner", "title", "issue")
  )
    return [clip(raisePiece(changes, self))];
  if (kind === "blocker.attach" && hasStrings(changes, "blocker", "issue"))
    return [attachPiece(changes, self)];
  if (kind === "blocker.resolve" && hasStrings(changes, "blocker", "title", "resolution"))
    return [
      clip(
        `${ref({ id: changes.blocker, title: changes.title })}: ${firstLine(changes.resolution)}`,
      ),
    ];
  if (kind === "reconcile.run" && hasStrings(changes, "by") && hasArrays(changes, "did", "raised"))
    return [runPiece(changes)];
  if (kind === "reconcile.sweep" && hasStrings(changes, "owner") && hasArrays(changes, "epics"))
    return [
      `${changes.epics.length} ${changes.epics.length === 1 ? "epic" : "epics"} · owner ${changes.owner}`,
    ];
  return changePieces(changes);
};

/** `  r4  wsl/claude  2h ago  issue.update  priority 2 → 1` */
const eventLine = (e: HistoryEvent, now: number, self: string | undefined): string => {
  const { revision, actor, when, kind, changes } = historyParts(e, now, self);
  return ["", revision, actor, when, kind, changes.join(", ")].join("  ").trimEnd();
};

/** One event of a thing's own history, in pieces. It names no target: the thing is the page. */
export type HistoryParts = {
  revision: string;
  actor: string;
  when: string;
  kind: string;
  changes: string[];
};

/**
 * `self` is the id whose history this is, which an edge event needs to read from the right
 * end: `blocks cn-2` on cn-1's page and `blocked by cn-1` on cn-2's. Without it an edge
 * prints as its whole sentence.
 */
export function historyParts(
  e: HistoryEvent,
  now: number = Date.now(),
  self?: string,
): HistoryParts {
  return {
    revision: e.revision === undefined ? "—" : `r${e.revision}`,
    actor: e.actor.name,
    when: since(e.at, now),
    kind: e.kind,
    changes: eventPieces(e.kind, e.changes, self),
  };
}

/**
 * The events a rejected write came back with. A stale write is not a failure to report:
 * it is what changed, who changed it and when, so the agent re-reads and retries
 * (docs/design.md §9). They are the history of the id the write named, so an edge among
 * them reads from that end.
 */
export const staleLines = (
  data: { id?: string; since?: HistoryEvent[] },
  now: number = Date.now(),
): string[] => (data.since ?? []).map((e) => eventLine(e, now, data.id));

/** The same lines, for `cn show <id> --history`: `self` is that id. */
export const historyLines = (
  events: HistoryEvent[],
  now: number = Date.now(),
  self?: string,
): string[] => events.map((e) => eventLine(e, now, self));

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
    changes: eventPieces(e.kind, e.changes, e.issue?.id),
  };
}

/**
 * One labelled line of `cn show`: a label, and either a run of text or the things it
 * names, with `code` where the line opens with something that ran. The brief is these
 * printed under the reference, and the web window's page for an id is these set as a
 * table, so the two say the same facts in the same words.
 */
export type Fact = { label: string; code?: string; text?: string; refs?: Named[] };

const factLine = ({ label: name, code, text, refs: items }: Fact): string =>
  `${label(name)}${code ? `${code} ` : ""}${items ? refs(items) : (text ?? "")}`;

export type ShownIssue = Extract<Shown, { kind: "issue" }>;
export type ShownEpic = Extract<Shown, { kind: "epic" }>;
export type ShownBlocker = Extract<Shown, { kind: "blocker" }>;

/** The one word for where an issue stands. */
export type StateWord =
  | "moving"
  | "waiting"
  | "stuck"
  | "blocked"
  | "deferred"
  | "closed"
  | "dropped"
  | "open";

/**
 * An issue's state in pieces: the word, and what it rests on. Where the state names other
 * things, `tail` is the preposition and `refs` the things, `waiting on bl-4 "…"`; where
 * it does not, `tail` is the rest of the line, `moving balder/claude 2h`, `stuck silent
 * 9d`, `deferred until 2026-10-01`, `closed 2h ago`; and `open` stands alone.
 */
export type StateParts = { word: StateWord; tail?: string; refs?: Referable[] };

// Anything not known to be finished holds: a deployment that does not send a status yet
// (the CLI is ahead of it until `push:cloud`) keeps reading its blockers as live.
const isLive = ({ status }: { status: string }): boolean =>
  status !== "closed" && status !== "dropped";

/** Only the end of a blocking edge that is still live holds anything (§4); a finished one is history. */
const finished = ({ status }: { status: string }): string | undefined =>
  status === "closed" ? "done" : status === "dropped" ? "dropped" : undefined;

/**
 * Where an issue stands, from its own fields and its neighbourhood, in the order the
 * words matter: held, then held up, then at rest. `stuck` is the epic's stuck line
 * pointing at this issue, computed by the deployment (design §8), never a second rule here.
 */
export function stateParts(shown: ShownIssue, now: number = Date.now()): StateParts {
  if (shown.status === "in_progress")
    return {
      word: "moving",
      tail: [
        shown.claimedBy?.name,
        shown.claimedAt === undefined ? undefined : age(shown.claimedAt, now),
      ]
        .filter((part): part is string => part !== undefined)
        .join(" "),
    };
  if (shown.status === "closed" || shown.status === "dropped")
    return {
      word: shown.status,
      tail: shown.closedAt === undefined ? undefined : since(shown.closedAt, now),
    };
  if (shown.waitingOn.length > 0) return { word: "waiting", tail: "on", refs: shown.waitingOn };
  if (shown.stuck) return { word: "stuck", tail: `silent ${age(shown.lastActivity, now)}` };
  const held = shown.blockedBy.filter(isLive);
  if (held.length > 0) return { word: "blocked", tail: "by", refs: held };
  if (shown.deferUntil !== undefined && shown.deferUntil > now)
    return { word: "deferred", tail: `until ${day(shown.deferUntil)}` };
  return { word: "open" };
}

/** The state as one run: `waiting on bl-4 "name the day"`, `moving balder/claude 2h`, `open`. */
export const stateLine = ({ word, tail, refs: items }: StateParts): string =>
  [word, tail, items === undefined ? undefined : refs(items)]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" ");

/** What a close stored (design §12). */
export type Verification = NonNullable<ShownIssue["verification"]>;

/**
 * A close's proof in pieces: what ran and how it ended, `vp run verify (exit 0)`, which
 * the page sets in mono because it gets pasted; then who closed on it and when. An
 * unverified close has no `ran`, and its reason ends the text. The output is the record's
 * whole; the brief leaves it out and the page prints it.
 */
export type ProofParts = { ran?: string; text: string; output?: string };

export function proofParts(record: Verification, now: number = Date.now()): ProofParts {
  const by = `by ${record.by.name} ${since(record.at, now)}`;
  if ("command" in record)
    return { ran: `${record.command} (exit ${record.exitCode})`, text: by, output: record.output };
  return { text: `unverified ${by}: ${record.unverified}` };
}

/**
 * An issue's facts, from its epic down to what it waits on. Its prose comes after them.
 * The status line opens with the state; where the state names other things they are on
 * their own line below, so `waiting on` and `blocked by` name a thing once.
 */
export function issueFacts(shown: ShownIssue, now: number = Date.now()): Fact[] {
  const state = stateParts(shown, now);
  const head = state.refs ? state.word : stateLine(state);
  const facts: Fact[] = [
    { label: "epic", refs: [shown.epic] },
    { label: "project", text: shown.project },
    {
      label: "status",
      text: `${head} · P${shown.priority} · created ${since(shown.createdAt, now)} · revision ${shown.revision}`,
    },
  ];
  if (shown.verification) {
    const { ran, text } = proofParts(shown.verification, now);
    facts.push({ label: "proof", code: ran, text });
  }
  if (shown.droppedReason !== undefined) facts.push({ label: "reason", text: shown.droppedReason });
  if (shown.requires.length > 0) facts.push({ label: "requires", text: shown.requires.join(", ") });
  if (shown.parent) facts.push({ label: "parent", refs: [shown.parent] });
  // The blocking edges, then the context ones: those say where an issue came from and what
  // it sits beside, and none of them touches readiness (design §3). A blocking edge with a
  // finished end reads as done, not as live: it holds nothing back and stays as history (§7).
  const ends = (items: (Referable & { status: string })[]): Named[] =>
    items.map(({ id, title, status }) => ({ id, title, tail: finished({ status }) }));
  const named: [string, Named[]][] = [
    ["follow-ups", shown.followUps],
    ["blocks", ends(shown.blocks)],
    ["blocked by", ends(shown.blockedBy)],
    ["related", shown.related],
    ["discovered from", shown.discoveredFrom],
    ["duplicates", shown.duplicates],
    ["supersedes", shown.supersedes],
    ["waiting on", shown.waitingOn],
  ];
  for (const [name, items] of named) if (items.length > 0) facts.push({ label: name, refs: items });
  return facts;
}

/** A blocker's facts: its kind and owner, where it stands, what ends it, what it holds. */
export function blockerFacts(shown: ShownBlocker, now: number = Date.now()): Fact[] {
  const facts: Fact[] = [
    { label: "kind", text: `${shown.blockerKind} · owner ${shown.owner}` },
    {
      label: "status",
      // `raised raised 2m ago` says it twice, so the status word goes where it adds one.
      text: `${shown.status === "raised" ? "" : `${shown.status} · `}raised ${since(shown.raisedAt, now)} by ${shown.raisedBy.name}`,
    },
    { label: "resolves when", text: shown.whatResolves },
  ];
  if (shown.nudgeAt !== undefined) facts.push({ label: "nudge", text: day(shown.nudgeAt) });
  if (shown.resolvedBy && shown.resolvedAt !== undefined)
    facts.push({
      label: "resolved",
      text: `by ${shown.resolvedBy.name} ${since(shown.resolvedAt, now)}: ${shown.resolution ?? ""}`,
    });
  if (shown.issues.length > 0) facts.push({ label: "holds", refs: shown.issues });
  return facts;
}

type JournalEntry = { at: number; author: { name: string }; kind: string; body: string };

/** One journal entry as `cn show` prints it: `  2h wsl/claude finding: what turned out true`. */
export const journalLine = (e: JournalEntry, now: number = Date.now()): string => {
  const { when, author, kind, body } = journalParts(e, now);
  return `  ${when} ${author} ${kind}: ${body}`;
};

/** The same entry in pieces. `when` is an age with no `ago`, as the line has it. */
export const journalParts = (e: JournalEntry, now: number = Date.now()) => ({
  when: age(e.at, now),
  author: e.author.name,
  kind: e.kind,
  body: e.body,
});

/** The ten-line brief of `cn show`, one shape per kind. */
export function brief(shown: Shown, now: number = Date.now()): string {
  if (shown.kind === "epic") {
    const lines = healthLines(shown, now);
    if (shown.description) lines.push(shown.description);
    lines.push(...shown.issues.map((i) => `  ${issueLine(i)}`));
    return lines.join("\n");
  }
  if (shown.kind === "blocker") {
    const lines = [ref(shown), ...blockerFacts(shown, now).map(factLine)];
    if (shown.events && shown.events.length > 0) {
      lines.push("history");
      lines.push(...historyLines(shown.events, now, shown.id));
    }
    return lines.join("\n");
  }

  const lines = [ref(shown), ...issueFacts(shown, now).map(factLine)];
  if (shown.description) lines.push(`${label("description")}${firstLine(shown.description)}`);
  if (shown.design) lines.push(`${label("design")}${firstLine(shown.design)}`);
  if (shown.acceptance) lines.push(`${label("acceptance")}${firstLine(shown.acceptance)}`);
  if (shown.journal.length > 0) {
    lines.push("journal");
    for (const e of shown.journal) lines.push(journalLine(e, now));
  }
  if (shown.events && shown.events.length > 0) {
    lines.push("history");
    lines.push(...historyLines(shown.events, now, shown.id));
  }
  return lines.join("\n");
}

/** What `cn brief` answers: the counts and the heads of design §8. */
export type BriefView = FunctionReturnType<typeof api.brief.get>;

/** Where this session is, for the brief's first line. */
export type BriefWhere = { deployment: string; actor: string; can: string[] };

/**
 * How long a claim has been silent: `26h`, `47h`, then `2d`, `9d`. It is only ever printed
 * past the 24-hour threshold, so the first two days stay in hours, where `1d` would hide
 * how far past the line a claim is; beyond that a day is the unit that means anything.
 */
const silence = (sinceMs: number, now: number): string => {
  const ms = Math.max(0, now - sinceMs);
  return ms < 2 * DAY ? `${Math.floor(ms / HOUR)}h` : age(sinceMs, now);
};

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
 * in progress     app-14 "fix connection retry" wsl/claude 2h · yours · web-9 "…" mac/claude 3d · silent 26h
 * follow-ups      app-22 "confirm the retry path" [verify] · 1 more needs what you lack
 * waiting on you  3
 * flagged         2
 * ```
 *
 * State, never doctrine: the rules are in the skill, which loads on demand, and a hook
 * always loads. The follow-ups line is the one place a capability list subtracts rather
 * than marks, and it says how many it left out, because `cn ready` is where every row
 * lives and none of them is ever hidden there.
 *
 * An in-progress row is marked `yours` when the deployment says the claim is this
 * session's, and `silent 26h` when it has been silent past the threshold (design §7,
 * §8): both are facts the deployment states, and the line only prints them.
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

  const holding = view.inProgress.map((i) => {
    const who = [
      ref(i),
      i.claimedBy?.name,
      i.claimedAt === undefined ? undefined : age(i.claimedAt, now),
    ]
      .filter((part): part is string => part !== undefined)
      .join(" ");
    const marks = [
      i.silentSince === undefined ? undefined : `silent ${silence(i.silentSince, now)}`,
      i.mine ? "yours" : undefined,
    ].filter((part): part is string => part !== undefined);
    return [who, ...marks].join(" · ");
  });
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

type HeldQuiet = BriefView["inProgress"][number] & { unjournaledSince: number };

/** The in-progress rows this session holds with nothing journaled past the threshold. */
export const unjournaled = (view: BriefView): HeldQuiet[] =>
  view.inProgress.filter(
    (i): i is HeldQuiet => i.mine === true && typeof i.unjournaledSince === "number",
  );

/**
 * The one line a session is handed when it tries to end a turn holding a claim with
 * nothing journaled past the threshold (docs/design.md §8), or nothing at all:
 *
 * ```
 * you hold cn-27 "retry on reconnect", last journal 3h ago
 * ```
 *
 * One clause per such claim, on one line however many there are. State, never doctrine:
 * what to do about it is the skill's. `unjournaledSince` is the deployment's mark, the
 * later of the claim and its newest entry, so a claim taken after that entry reads
 * `claimed 2h ago, nothing journaled since` rather than naming an entry that predates it.
 */
export function unjournaledLine(view: BriefView, now: number = Date.now()): string | undefined {
  const clauses = unjournaled(view).map((i) => {
    const at = i.unjournaledSince;
    const tail =
      i.lastJournal === at
        ? `last journal ${since(at, now)}`
        : `claimed ${since(at, now)}, nothing journaled since`;
    return `${ref(i)}, ${tail}`;
  });
  return clauses.length === 0 ? undefined : `you hold ${clauses.join(" · ")}`;
}
