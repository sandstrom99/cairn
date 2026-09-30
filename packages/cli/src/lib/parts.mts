// parts.mts: the pieces a line is joined from. A line in the pieces a surface with columns
// sets apart: what the line is about, the word that classes it, and the rest of it as one
// run. Every `…Parts` and `…Facts` here answers some shape of this, and the `…Line` beside
// it in lines.mts is those pieces joined, so the web window's rows and cn's lines cannot
// drift: apps/web imports these and pins each row's text to the line. Nothing here pads or
// joins a whole line; what is joined here is a run inside one piece.

import { type Referable, ref } from "./ref.mts";
import { age, day, since } from "./time.mts";
import type {
  BlockerLineView,
  BriefView,
  EpicLineView,
  HealthView,
  HistoryEvent,
  IssueLineView,
  JournalEntry,
  LogEvent,
  ProjectView,
  ShownBlocker,
  ShownIssue,
  Verification,
} from "./views.mts";

/** The issue line in pieces, each already the token the line prints: `P2`, `r3`. */
type IssueParts = {
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
 * `bl-1 "the App Store agreement" approval · owner balder · raised 5m ago by wsl/claude`,
 * in pieces. The owner is the point of the line: a blocker is work only a person can do,
 * so the person is named before anything else about it. The tail is whichever end of its
 * lifecycle it is at — who raised it while it waits, who ended it once it is resolved —
 * and the status word is dropped where the tense already says it, so a raised blocker
 * reads `raised 5m ago` rather than `raised · raised 5m ago`.
 */
type BlockerParts = { target: Referable; kind: string; tail: string };

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

/**
 * One fact of an epic's health: which of the three it is, what it names, and the rest; or,
 * as the second shape, the count of the stuck issues past the ones named.
 */
export type HealthRow =
  | { fact: "moving" | "stuck" | "waiting"; target: Referable; tail: string }
  | { fact: "more"; tail: string };

/** How many stuck issues an epic's health names before it counts the rest (§8). */
const STUCK_NAMED = 3;

/** The health block in pieces: the epic, its counts as one run, and a row per fact. */
export type HealthParts = { epic: Referable; counts: string; rows: HealthRow[] };

/** The counts as one run: `2 done · 0 open · 1 follow-up`. The health block and the review both head with it. */
export const countsRun = (counts: EpicLineView["counts"]): string => {
  const { open, inProgress, closed, followUps } = counts;
  return `${closed} done · ${open + inProgress} open · ${followUps} ${
    followUps === 1 ? "follow-up" : "follow-ups"
  }`;
};

/**
 * An epic's health in pieces (docs/design.md §8): what is moving, what is stuck past its
 * priority's limit, the first three by name and the rest counted, and what waits on a
 * person. A row with nothing behind it is not there at all.
 */
export function healthParts(view: HealthView, now: number = Date.now()): HealthParts {
  const rows: HealthRow[] = [];
  for (const issue of view.health.moving)
    rows.push({
      fact: "moving",
      target: issue,
      tail: `${issue.claimedBy.name} ${age(issue.claimedAt, now)}`,
    });
  for (const issue of view.health.stuck.slice(0, STUCK_NAMED))
    rows.push({ fact: "stuck", target: issue, tail: `silent ${age(issue.lastActivity, now)}` });
  if (view.health.stuck.length > STUCK_NAMED)
    rows.push({ fact: "more", tail: `and ${view.health.stuck.length - STUCK_NAMED} more stuck` });
  for (const blocker of view.health.waiting)
    rows.push({ fact: "waiting", target: blocker, tail: `· owner ${blocker.owner}` });
  return { epic: view, counts: countsRun(view.counts), rows };
}

/** A project's block in pieces, as `cn project list` prints it: its head is the slug and name in the reference form, and a project nothing has been filed under has `nothing filed` for its counts and no rows. */
export function projectParts(project: ProjectView, now: number = Date.now()): HealthParts {
  const head = { id: project.slug, title: project.name };
  if (project.filed === 0) return { epic: head, counts: "nothing filed", rows: [] };
  return healthParts({ ...head, counts: project.counts, health: project.health }, now);
}

/** A reference with a word after it where the thing named is not what it was: `cn-6 "…" done`. */
export type Named = Referable & { tail?: string };

export const named = (item: Named): string => (item.tail ? `${ref(item)} ${item.tail}` : ref(item));
export const refs = (items: Named[]): string => items.map(named).join(", ");

/**
 * The first line of a text, marked `…` where more follows it. The text is Markdown, and a
 * heading's `#`s are markup a line has no use for: `## Shape 1 first` prints as its words.
 */
export const firstLine = (text: string): string => {
  const [first = "", ...rest] = text.split("\n");
  const head = first.replace(/^ {0,3}#{1,6}[ \t]+/, "");
  return rest.length > 0 && rest.join("").trim() !== "" ? `${head}…` : head;
};

/** As much of one event's payload as belongs on a line. */
const CHANGES = 80;

const clip = (text: string): string =>
  text.length > CHANGES ? `${text.slice(0, CHANGES - 1)}…` : text;

/** A string prints as itself; anything else as its JSON, so `2 → 1` is not `"2" → "1"`. */
const side = (value: unknown): string =>
  value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value);

type FieldMap = Record<string, { from?: unknown; to?: unknown }>;

// `from`, `to`, both or neither: a value of undefined is not stored, so the first write of
// a field that had none comes back as `{ to }` alone, and a raw patch that cleared a field
// already clear as `{}`.
const isFieldMap = (changes: unknown): changes is FieldMap =>
  typeof changes === "object" &&
  changes !== null &&
  !Array.isArray(changes) &&
  Object.values(changes).every(
    (v) =>
      typeof v === "object" &&
      v !== null &&
      !Array.isArray(v) &&
      Object.keys(v).every((key) => key === "from" || key === "to"),
  );

/** The housekeeping a raw patch carries and no event records: the row's own time says it. */
const HOUSEKEEPING = new Set(["claimedAt", "closedAt", "lastActivity", "resolvedAt"]);

/**
 * The actor a raw patch of this kind carries and today's event leaves out: a close or a
 * drop ends the claim, which the claim's own event named, and a resolve's resolver is the
 * event's actor.
 */
const UNRECORDED_ACTOR: Record<string, string> = {
  "issue.close": "claimedBy",
  "issue.drop": "claimedBy",
  "blocker.resolve": "resolvedBy",
};

/** A raw patch's value as today's event records it: an actor by name, a proof as its summary. */
const recordedValue = (value: unknown): unknown => {
  if (hasStrings(value, "command") && "exitCode" in value)
    return `${value.command} (exit ${String(value.exitCode)})`;
  if (hasStrings(value, "unverified")) return `unverified: ${value.unverified}`;
  if (hasStrings(value, "kind", "name")) return value.name;
  return value;
};

/**
 * A field map as the changes its move records today. Events written before 2026-09-20
 * carry the raw patch of a claim, release, close, drop or a blocker's own resolve, since
 * nothing migrates an audit trail (docs/design.md §3), so this is where the two shapes
 * meet: an old close reads as `status in_progress → closed, verification — → vp run verify
 * (exit 0)`, the same line a close made today prints. A map of today's shape passes
 * through as it is.
 */
const asRecorded = (kind: string, changes: FieldMap): FieldMap => {
  const kept: FieldMap = {};
  for (const [field, { from, to }] of Object.entries(changes)) {
    if (HOUSEKEEPING.has(field) || field === UNRECORDED_ACTOR[kind]) continue;
    if (from === undefined && to === undefined) continue;
    kept[field] = { from: recordedValue(from), to: recordedValue(to) };
  }
  return kept;
};

/** A link as an event records it: the URL and its label, never who or when. */
type LinkRecord = { url: string; label?: string };

const isLinkRecords = (value: unknown): value is LinkRecord[] =>
  Array.isArray(value) && value.every((link) => hasStrings(link, "url"));

/** A link as the pieces name it: `doc · https://…`, or the URL alone. */
const linkName = ({ url, label }: LinkRecord): string => (label ? `${label} · ${url}` : url);

/**
 * A links change in words rather than JSON: `linked <link>` for each URL `to` has and
 * `from` does not, `unlinked <link>` for each the other way, named as it was, and
 * `relabelled doc → the doc · https://…` for each in both whose label moved.
 */
const linkPieces = (from: LinkRecord[], to: LinkRecord[]): string[] => {
  const pieces: string[] = [];
  const was = new Map(from.map((link) => [link.url, link]));
  const now = new Map(to.map((link) => [link.url, link]));
  for (const link of to) if (!was.has(link.url)) pieces.push(`linked ${linkName(link)}`);
  for (const link of from) if (!now.has(link.url)) pieces.push(`unlinked ${linkName(link)}`);
  for (const link of to) {
    const old = was.get(link.url);
    if (old !== undefined && old.label !== link.label)
      pieces.push(`relabelled ${old.label ?? "—"} → ${link.label ?? "—"} · ${link.url}`);
  }
  return pieces;
};

/**
 * One event's payload in pieces: `priority 2 → 1` per field for the field-map shape, the
 * compact JSON as a single piece for anything else, and a links change `linkPieces`.
 * Joined with `, ` they are what a line has room for, so the cut is made here, inside the
 * piece it lands in, and nothing a reader of the pieces sees differs from what a reader of
 * the line sees.
 */
export const changePieces = (changes: unknown): string[] => {
  if (changes === undefined) return [];
  if (!isFieldMap(changes)) {
    const text = clip(JSON.stringify(changes) ?? "");
    return text === "" ? [] : [text];
  }
  const pieces = Object.entries(changes).flatMap(([field, { from, to }]) =>
    field === "links" && isLinkRecords(from) && isLinkRecords(to)
      ? linkPieces(from, to)
      : [`${field} ${side(from)} → ${side(to)}`],
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
 * A `cn reconcile` run, which #32 deleted with the verb, in the words its answer headed
 * with and who asked: `did 2 · raised 1 · by balder/claude`. ep-1 and ep-6 on the worklist
 * still carry three, from 2026-09-17.
 */
const runPiece = ({ by, did, raised }: { by: string; did: unknown[]; raised: unknown[] }) =>
  `${did.length === 0 && raised.length === 0 ? "nothing to do" : `did ${did.length} · raised ${raised.length}`} · by ${by}`;

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

/** The person's words an ack or a resolve rested on, as the last piece of its line. */
const saidPiece = (said: unknown): string[] =>
  typeof said === "string" ? [clip(`on their word "${firstLine(said)}"`)] : [];

/**
 * One event's payload in pieces, by its kind. A journal append is `finding: <its first
 * line>`, the way `cn show` lists the entry; an edge is `edgePiece` relative to `self`,
 * the issue the line is about, and a blocker's raise and attach read relative to it the
 * same way; the resolve recorded on each issue a blocker held is the blocker and the note,
 * `bl-3 "…": done`; a reconcile run is `runPiece`. A create has no payload, because the reference
 * at the start of its line already names what was created, except a project, which has no
 * reference to lead with and so is its slug and name here. A field map is `changePieces`
 * of it `asRecorded`, and anything else `changePieces` as it is; an ack or a resolve that
 * rested on the person's words ends with them, `on their word "…"`, on either side.
 */
const eventPieces = (kind: string, changes: unknown, self: string | undefined): string[] => {
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
      ...saidPiece("said" in changes ? changes.said : undefined),
    ];
  if (kind === "reconcile.run" && hasStrings(changes, "by") && hasArrays(changes, "did", "raised"))
    return [runPiece(changes)];
  if (
    (kind === "blocker.ack" || kind === "blocker.resolve") &&
    isFieldMap(changes) &&
    changes.said !== undefined
  ) {
    const { said, ...rest } = changes;
    return [...changePieces(asRecorded(kind, rest)), ...saidPiece(said.to)];
  }
  return changePieces(isFieldMap(changes) ? asRecorded(kind, changes) : changes);
};

/** One event of a thing's own history, in pieces. It names no target: the thing is the page. */
type HistoryParts = {
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

/** One event in pieces: a target where it names one, and its payload a change at a time. */
type LogParts = {
  target?: Referable;
  kind: string;
  actor: string;
  when: string;
  changes: string[];
};

/**
 * The target leads because that is what happened to, an issue first since an event that
 * names both an issue and its blocker is about the issue; a create has no payload,
 * because the reference at the start of the line already names what was created. A
 * project never leads: the page links a lead to its `/<id>`, and a project has no page,
 * so a project's update names it at the start of its changes instead, the way the
 * resolve that freed an issue names its blocker.
 */
export function logParts(e: LogEvent, now: number = Date.now()): LogParts {
  const pieces = eventPieces(e.kind, e.changes, e.issue?.id);
  const changes =
    e.kind === "project.update" && e.project !== undefined
      ? pieces.length > 0
        ? [clip(`${ref(e.project)}: ${pieces[0]}`), ...pieces.slice(1)]
        : [clip(ref(e.project))]
      : pieces;
  return {
    target: e.issue ?? e.blocker ?? e.epic,
    kind: e.kind,
    actor: e.actor.name,
    when: since(e.at, now),
    changes,
  };
}

/**
 * One labelled line of `cn show`: a label, and either a run of text or the things it
 * names, with `code` where the line opens with something that ran. The brief is these
 * printed under the reference, and the web window's page for an id is these set as a
 * table, so the two say the same facts in the same words.
 */
export type Fact = {
  label: string;
  code?: string;
  text?: string;
  refs?: Named[];
  links?: LinkParts[];
};

/** One link on an issue, an epic or a blocker: the three store the same shape. */
type ShownLink = NonNullable<ShownIssue["links"]>[number];

/** A link in pieces: its label where it has one, its URL whole, and who added it when. */
export type LinkParts = { url: string; label?: string; by: string };

/** `by balder/claude 2h ago`, the same words as a proof's. */
export const linkParts = (link: ShownLink, now: number = Date.now()): LinkParts => ({
  url: link.url,
  ...(link.label === undefined ? {} : { label: link.label }),
  by: `by ${link.by.name} ${since(link.at, now)}`,
});

/**
 * The `links` fact, or none when there are none. Read as `?? []`: a deployment not yet
 * pushed with the field sends none.
 */
export const linkFacts = (
  links: readonly ShownLink[] | undefined,
  now: number = Date.now(),
): Fact[] =>
  links === undefined || links.length === 0
    ? []
    : [{ label: "links", links: links.map((link) => linkParts(link, now)) }];

/** The one word for where an issue stands. */
type StateWord =
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
type StateParts = { word: StateWord; tail?: string; refs?: Referable[] };

// Anything not known to be finished holds: a deployment that does not send a status yet
// (the CLI is ahead of it until `push:cloud`) keeps reading its blockers as live.
const isLive = ({ status }: { status: string }): boolean =>
  status !== "closed" && status !== "dropped";

/**
 * cn's word for a finished issue wherever it is named, `done` or `dropped`; a live one has
 * none. Only the live end of a blocking edge holds anything (§4).
 */
export const finished = ({ status }: { status: string }): string | undefined =>
  status === "closed" ? "done" : status === "dropped" ? "dropped" : undefined;

/**
 * Issues as `cn show` names them: each finished one carries cn's word after its reference,
 * `done` or `dropped`, and a live one none.
 */
const ends = (items: (Referable & { status: string })[]): Named[] =>
  items.map(({ id, title, status }) => ({ id, title, tail: finished({ status }) }));

/**
 * Where an issue stands, from its own fields and its neighbourhood, in the order the
 * words matter: held, then held up, then at rest. `stuck` is this issue being among its
 * epic's stuck issues, computed by the deployment (design §8), never a second rule here.
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

/**
 * A close's proof in pieces: what ran and how it ended, `vp run verify (exit 0)`, which
 * the page sets in mono because it gets pasted; then who closed on it and when. An
 * unverified close has no `ran`, and its reason ends the text. The output is the record's
 * whole; the brief leaves it out and the page prints it.
 */
type ProofParts = { ran?: string; text: string; output?: string };

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
  if (shown.parent) facts.push({ label: "parent", refs: ends([shown.parent]) });
  // The blocking edges, then the context ones: those say where an issue came from and what
  // it sits beside, and none of them touches readiness (design §3). Every issue named here
  // that is finished reads as done or dropped, not as live: a blocking edge's finished end
  // holds nothing back and stays as history (§7), and a finished follow-up is no work left.
  const named: [string, Named[]][] = [
    ["follow-ups", ends(shown.followUps)],
    ["blocks", ends(shown.blocks)],
    ["blocked by", ends(shown.blockedBy)],
    ["related", ends(shown.related)],
    ["discovered from", ends(shown.discoveredFrom)],
    ["duplicates", ends(shown.duplicates)],
    ["supersedes", ends(shown.supersedes)],
    ["waiting on", shown.waitingOn],
  ];
  for (const [name, items] of named) if (items.length > 0) facts.push({ label: name, refs: items });
  facts.push(...linkFacts(shown.links, now));
  return facts;
}

/**
 * A blocker's facts: its kind and owner, where it stands and at which revision, what ends
 * it, what it holds, and its links.
 */
export function blockerFacts(shown: ShownBlocker, now: number = Date.now()): Fact[] {
  const facts: Fact[] = [
    { label: "kind", text: `${shown.blockerKind} · owner ${shown.owner}` },
    {
      label: "status",
      // `raised raised 2m ago` says it twice, so the status word goes where it adds one.
      text: `${shown.status === "raised" ? "" : `${shown.status} · `}raised ${since(shown.raisedAt, now)} by ${shown.raisedBy.name} · revision ${shown.revision}`,
    },
    { label: "resolves when", text: shown.whatResolves },
  ];
  if (shown.nudgeAt !== undefined) facts.push({ label: "nudge", text: day(shown.nudgeAt) });
  if (shown.resolvedBy && shown.resolvedAt !== undefined)
    facts.push({
      label: "resolved",
      text: `by ${shown.resolvedBy.name} ${since(shown.resolvedAt, now)}: ${shown.resolution ?? ""}`,
    });
  if (shown.said !== undefined) facts.push({ label: "on their word", text: `"${shown.said}"` });
  if (shown.issues.length > 0) facts.push({ label: "holds", refs: ends(shown.issues) });
  facts.push(...linkFacts(shown.links, now));
  return facts;
}

/** A journal entry in pieces. `when` is an age with no `ago`, as the line has it. */
export const journalParts = (e: JournalEntry, now: number = Date.now()) => ({
  when: age(e.at, now),
  author: e.author.name,
  kind: e.kind,
  body: e.body,
});

/** An in-progress row this session holds with nothing journaled past the threshold. */
type HeldQuiet = BriefView["inProgress"][number] & { unjournaledSince: number };

/** The in-progress rows this session holds with nothing journaled past the threshold. */
export const unjournaled = (view: BriefView): HeldQuiet[] =>
  view.inProgress.filter(
    (i): i is HeldQuiet => i.mine === true && typeof i.unjournaledSince === "number",
  );
