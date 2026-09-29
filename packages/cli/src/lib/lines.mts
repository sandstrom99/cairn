// lines.mts: the lines cn prints. Every line naming an issue or epic starts with the
// reference form (ref.mts), so a list is readable a day later without looking anything
// up. A line is its pieces (parts.mts) joined and padded into columns; the words are
// decided there, and here is only where each one goes on the line. The web window never
// imports this file: it sets the same pieces in its own columns, and its tests import it
// to hold each row's text to the line.

import { type Referable, ref } from "./ref.mts";
import { age, day, silence, since } from "./time.mts";
import {
  type Fact,
  type LinkParts,
  blockerFacts,
  blockerParts,
  countsRun,
  finished,
  firstLine,
  healthParts,
  historyParts,
  issueFacts,
  issueParts,
  journalParts,
  linkFacts,
  logParts,
  named,
  refs,
  unjournaled,
} from "./parts.mts";
import type {
  BlockerLineView,
  BriefView,
  BriefWhere,
  ClosedView,
  EdgeView,
  EpicClosedView,
  EpicLineView,
  HistoryEvent,
  IssueLineView,
  JournalEntry,
  ListLineView,
  LogEvent,
  ReviewView,
  SearchLineView,
  Shown,
} from "./views.mts";

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

/**
 * The issue line, plus `· silent 4d` where the list was asked what nobody has touched and
 * `· blocked by cn-1 "…"` where it was asked what a live edge holds: the words `cn show`'s
 * status line uses for the same two facts, so a list and a brief never disagree.
 */
export function listLine(view: ListLineView, now: number = Date.now()): string {
  let line = issueLine(view);
  if (view.silentSince !== undefined) line += ` · silent ${age(view.silentSince, now)}`;
  if (view.blockedBy && view.blockedBy.length > 0) line += ` · blocked by ${refs(view.blockedBy)}`;
  return line;
}

/** The issue line, marked with the field the search text was found in: `· in journal`. */
export function searchLine(view: SearchLineView): string {
  return `${issueLine(view)} · in ${view.matched}`;
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

/** `bl-1 "the App Store agreement" approval · owner balder · raised 5m ago by wsl/claude` */
export function blockerLine(view: BlockerLineView, now: number = Date.now()): string {
  const { target, kind, tail } = blockerParts(view, now);
  return `${ref(target)} ${kind} · ${tail}`;
}

/** `  holds  cn-4 "…", cn-7 "…"`: the issues a blocker keeps out of ready, under its line. */
export const holdsLine = (issues: Referable[]): string => `  holds  ${refs(issues)}`;

/** `  freed  cn-4 "…", cn-7 "…"`: the issues a resolve let back into ready, under its line. */
export const freedLine = (issues: Referable[]): string => `  freed  ${refs(issues)}`;

/**
 * An epic's health, as many lines as it has facts (docs/design.md §8):
 *
 * ```
 * ep-3 "An epic tells the truth"  2 done · 7 open · 1 follow-up
 *   moving   cn-7 "the web window's first page" balder/claude 2h
 *   stuck    cn-9 "the page's live feed" silent 9d
 *   stuck    cn-11 "the rail's counts" silent 4d
 *   stuck    cn-12 "the log's filters" silent 8d
 *            and 2 more stuck
 *   waiting  bl-3 "confirm the invite copy" · owner balder
 * ```
 *
 * Never a percentage: an epic at 95% frozen for a month reads better than one at 40%
 * advancing daily. A line with nothing behind it is not printed at all, so a fresh epic
 * is one line and the three that follow are only there when they say something. Stuck
 * issues are named most urgent first, three at most, and the rest counted.
 */
export function healthLines(view: EpicLineView, now: number = Date.now()): string[] {
  const { epic, counts, rows } = healthParts(view, now);
  return [
    `${ref(epic)}  ${counts}`,
    ...rows.map((row) =>
      row.fact === "more"
        ? `  ${fact("")}${row.tail}`
        : `  ${fact(row.fact)}${ref(row.target)} ${row.tail}`,
    ),
  ];
}

/**
 * What `cn review` reads in one epic, one line per finding, each in the reference form:
 *
 * ```
 * ep-1 "Create to close"  1 done · 3 open · 1 follow-up
 *   near        cn-3 "fix connection retry" and cn-4 "Fix connection retry."
 *   inbox       cn-7 "the retry path" 8d
 *   nudge       bl-1 "App Store review" · owner balder · nudge 2026-09-03 · holds cn-1 "…"
 *   silent      cn-2 "the graph" wsl/claude · silent 8d
 *   unverified  cn-5 "the brief" closed 8d ago · no follow-up · no device here
 *   edge        cn-5 "the brief" done blocks cn-1 "the lifecycle"
 *   can close   cn epic close ep-1 --revision 0
 * ```
 *
 * Every line is a fact the deployment stated, and what to do about it is left to the two
 * reading it. With no finding at all the one row is `nothing to look at`, so an empty
 * answer still says the epic was read.
 */
export function reviewLines(view: ReviewView, now: number = Date.now()): string[] {
  const rows: string[] = [];
  const row = (name: string, text: string) => rows.push(`  ${finding(name)}${text}`);
  for (const { a, b } of view.near) row("near", `${ref(a)} and ${ref(b)}`);
  for (const item of view.inbox) row("inbox", `${ref(item)} ${age(item.createdAt, now)}`);
  for (const blocker of view.nudges)
    row(
      "nudge",
      [
        ref(blocker),
        `owner ${blocker.owner}`,
        `nudge ${day(blocker.nudgeAt)}`,
        ...(blocker.holds.length > 0 ? [`holds ${refs(blocker.holds)}`] : []),
      ].join(" · "),
    );
  for (const issue of view.silent)
    row("silent", `${ref(issue)} ${issue.claimedBy.name} · silent ${age(issue.lastActivity, now)}`);
  for (const issue of view.unverified)
    row(
      "unverified",
      `${ref(issue)} closed ${since(issue.closedAt, now)} · no follow-up · ${firstLine(issue.reason)}`,
    );
  for (const { from, to } of view.edges)
    row(
      "edge",
      `${named({ ...from, tail: finished(from) })} blocks ${named({ ...to, tail: finished(to) })}`,
    );
  if (view.canClose)
    row("can close", `cn epic close ${view.epic.id} --revision ${view.epic.revision}`);
  return [
    `${ref(view.epic)}  ${countsRun(view.epic.counts)}`,
    ...(rows.length > 0 ? rows : ["  nothing to look at"]),
  ];
}

/**
 * Under `cn close`, when the close finished the last issue of its epic: the offer, and the
 * line that takes it, `  epic       ep-1 "…" can close · cn epic close ep-1 --revision 0`.
 * The label is as wide as the `follow-up` one printed above it.
 */
export const epicDoneLine = (epic: Referable & { revision: number }): string =>
  `  ${answer("epic")}${ref(epic)} can close · cn epic close ${epic.id} --revision ${epic.revision}`;

/**
 * Under `cn close`, an issue this close was the last thing holding, as `cn ready` would
 * print it: `  ready      cn-3 "…" P2 open  ep-1 "…" r0`.
 */
const madeReadyLine = (view: IssueLineView): string => `  ${answer("ready")}${issueLine(view)}`;

/** Under `cn create`, one live issue in the epic whose title is near-identical to the new one. */
export const nearLine = (match: Referable): string => `  ${answer("near")}${ref(match)}`;

/** Under `cn create`, when an issue bound for the inbox went beside its parent instead. */
export const placedLine = (parent: Referable): string =>
  `  ${answer("placed")}beside its parent ${ref(parent)}, not in the inbox`;

/** Under `cn close`, the follow-up the same mutation made: `  follow-up  cn-8 "verify: …" …`. */
const followUpLine = (issue: IssueLineView): string =>
  `  ${answer("follow-up")}${issueLine(issue)}`;

/**
 * The lines of a close: the issue as it now stands, then under it the follow-up the same
 * mutation spawned, each open issue the close was the last thing holding as a `ready`
 * line, so the next pick is on the screen without a `cn ready`, and the offer to close
 * the epic when this was its last issue.
 */
export function closedLines(view: ClosedView): string[] {
  const lines = [issueLine(view.issue)];
  if (view.followUp) lines.push(followUpLine(view.followUp));
  for (const ready of view.madeReady) lines.push(madeReadyLine(ready));
  if (view.epicDone) lines.push(epicDoneLine(view.epicDone));
  return lines;
}

/**
 * `ep-3 "…" closed r2`, or `dropped r2`: the word is the status the deployment answered
 * with, never the flag the verb was given. Under it, each issue a drop took with the
 * epic, and the follow-ups a close left open: a close waits for none of them
 * (docs/design.md §7), so the reader is told they are still routed work.
 */
export function epicClosedLines({ epic, dropped }: EpicClosedView): string[] {
  const lines = [`${ref(epic)} ${epic.status} r${epic.revision}`];
  for (const issue of dropped) lines.push(`  ${answer("dropped")}${ref(issue)}`);
  const { followUps } = epic.counts;
  if (followUps > 0)
    lines.push(`  ${followUps} ${followUps === 1 ? "follow-up" : "follow-ups"} still open`);
  return lines;
}

/** `cn  cairn: backend, cli, plugin`: a project is its slug, then its name. */
export const projectLine = (project: { slug: string; name: string }): string =>
  `${project.slug}  ${project.name}`;

/** The label column: the longest label is `discovered from`, and one space after it. */
const label = (name: string): string => name.padEnd(16);
/** The health block's column: `waiting` is the longest of the three, and two after it. */
const fact = (name: string): string => name.padEnd(9);
/** The review's column: `unverified` is the longest, and two after it. */
const finding = (name: string): string => name.padEnd(12);
/** The column of the lines under a write's answer: `follow-up`, and two after it. */
const answer = (name: string): string => name.padEnd(11);

/** `  r4  wsl/claude  2h ago  issue.update  priority 2 → 1` */
const eventLine = (e: HistoryEvent, now: number, self: string | undefined): string => {
  const { revision, actor, when, kind, changes } = historyParts(e, now, self);
  return ["", revision, actor, when, kind, changes.join(", ")].join("  ").trimEnd();
};

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

/**
 * `cn-2 "scratch: second"  issue.claim  wsl/claude  2h ago  status open → in_progress, …`
 *
 * The target leads because that is what happened to; a create prints no payload, because
 * the reference at the start of the line already names what was created.
 */
export function logLine(e: LogEvent, now: number = Date.now()): string {
  const { target, kind, actor, when, changes } = logParts(e, now);
  return [target ? ref(target) : "—", kind, actor, when, changes.join(", ")].join("  ").trimEnd();
}

/**
 * One link as `cn show` prints it: `doc · https://example.com/doc · by balder/claude 2h
 * ago`. The URL is always whole, scheme and all, so a terminal can open it.
 */
export const linkLine = ({ label, url, by }: LinkParts): string =>
  [label, url, by].filter(Boolean).join(" · ");

/**
 * One labelled line of `cn show`, its label padded to the column. A fact with links is a
 * line per link, the label on the first and the column held on the rest.
 */
const factLine = ({ label: name, code, text, refs: items, links }: Fact): string =>
  links
    ? links.map((link, i) => `${label(i === 0 ? name : "")}${linkLine(link)}`).join("\n")
    : `${label(name)}${code ? `${code} ` : ""}${items ? refs(items) : (text ?? "")}`;

/** One journal entry as `cn show` prints it: `  2h wsl/claude finding: what turned out true`. */
const journalLine = (e: JournalEntry, now: number = Date.now()): string => {
  const { when, author, kind, body } = journalParts(e, now);
  return `  ${when} ${author} ${kind}: ${body}`;
};

/** The ten-line brief of `cn show`, one shape per kind. */
export function brief(shown: Shown, now: number = Date.now()): string {
  if (shown.kind === "epic") {
    // The head gains the revision here alone, for `cn update ep-N`: a health block in
    // `cn epic list` or `cn review` is read, not written against.
    const [head, ...health] = healthLines(shown, now);
    const lines = [`${head} · revision ${shown.revision}`, ...health];
    lines.push(...linkFacts(shown.links, now).map(factLine));
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

/** As many rows as a glance holds, then `+N more`. */
const capped = (rows: string[], cap: number): string =>
  rows.length > cap
    ? `${rows.slice(0, cap).join(" · ")} · +${rows.length - cap} more`
    : rows.join(" · ");

const IN_PROGRESS_CAP = 5;
const FOLLOW_UP_CAP = 3;

/**
 * The situation report, at most five lines (docs/design.md §8):
 *
 * ```
 * cairn · acme · wsl/claude
 * ready 4         app-31 "retry on reconnect" P1 · app-40 "…" P2
 * in progress     app-14 "fix connection retry" wsl/claude 2h · yours · web-9 "…" mac/claude 3d · silent 26h
 * follow-ups      app-22 "confirm the retry path" [verify] · app-23 "…" [decide]
 * waiting on you  3
 * ```
 *
 * State, never doctrine: the rules are in the skill, which loads on demand, and a hook
 * always loads.
 *
 * An in-progress row is marked `yours` when the deployment says the claim is this
 * session's, and `silent 26h` when it has been silent past the threshold (design §7,
 * §8): both are facts the deployment states, and the line only prints them.
 */
export function briefLines(view: BriefView, where: BriefWhere, now: number = Date.now()): string[] {
  const lines = [`cairn · ${where.deployment} · ${where.actor}`];

  const ready = view.ready.top.map((i) => `${ref(i)} P${i.priority}`);
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

  const followUps = view.followUps.map(
    (f) => `${ref(f)}${f.followUpKind === undefined ? "" : ` [${f.followUpKind}]`}`,
  );
  lines.push(
    `${label("follow-ups")}${followUps.length === 0 ? "none" : capped(followUps, FOLLOW_UP_CAP)}`,
  );

  lines.push(`${label("waiting on you")}${view.waiting}`);
  return lines;
}

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
