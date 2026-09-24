// The pin: a row on the page is one of cn's lines, typeset. Each pin renders the element and
// cn's line from the same view and holds the element's text to the line, give or take the
// padding cn uses for columns, and where it is a list, a line to a row. A word changed in
// parts.mts changes both or fails here; a row that drops, reorders or rewords a piece of its
// line fails here. The pins are one table, PINS, and two tests run over all of it.
//
// Rendered to a string rather than to a DOM, like everything in this suite (testing.tsx).
import {
  blockerLine,
  brief,
  healthLines,
  historyLines,
  holdsLine,
  issueLine,
  logLine,
} from "@cairn/cli/lines";
import { countsRun } from "@cairn/cli/parts";
import { ref } from "@cairn/cli/ref";
import { DAY, HOUR, agent, epic, issue, logEvent, now } from "@cairn/cli/testing";
import type { HistoryEvent } from "@cairn/cli/views";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeedEvent, HistoryEntry } from "./Feed.tsx";
import { EpicPage, JournalEntry } from "./ItemPages.tsx";
import { JumpRow, withTyped } from "./JumpBar.tsx";
import { IssuesPage, LogPage } from "./ListPages.tsx";
import { Epics, Waiting, type WaitingBlocker } from "./Overview.tsx";
import { squeeze } from "./plain.ts";
import { Rail } from "./Rail.tsx";
import { IssueRows, type Listed } from "./rows.tsx";
import { rows, text } from "./testing.tsx";
import { epicWord } from "./tone.tsx";

const busy = epic({
  id: "ep-4",
  title: 'Humans in the "loop"',
  counts: { open: 1, inProgress: 1, closed: 5, dropped: 0, followUps: 1 },
  health: {
    moving: [
      {
        id: "cn-26",
        title: "apps/web, the read-only window",
        claimedBy: { name: "balder/claude", kind: "agent" },
        claimedAt: now - 2 * HOUR,
      },
    ],
    stuck: { id: "cn-10", title: "Invyte runs on cairn", lastActivity: now - 9 * DAY },
    waiting: [{ id: "bl-4", title: "name the day", owner: "balder" }],
  },
});

const still = epic({ id: "ep-0", title: "Inbox" });

/** `busy` with a description, which stands between its head line and its rows. */
const described = { ...busy, id: "ep-5", description: "what this epic is for" };

/** Three epics with nothing moving, touched an hour, a day and two days ago. */
const a = epic({
  id: "ep-7",
  title: "cn prints what it knows",
  description: "every verb prints its lines",
  lastActivity: now - HOUR,
});
const b = epic({ id: "ep-2", title: "A session starts warm", lastActivity: now - DAY });
const c = epic({ id: "ep-0", title: "Inbox", lastActivity: now - 2 * DAY });

/** An issue under `a`, so an event on it is `a`'s newest line. */
const underA: Listed = {
  id: "cn-9",
  title: "the page's live feed",
  status: "open",
  priority: 2,
  claimedBy: undefined,
  epic: { id: "ep-7", title: "cn prints what it knows" },
  type: "task",
};
const onA = logEvent({
  kind: "issue.claim",
  issue: { id: "cn-9", title: "the page's live feed" },
  at: now - HOUR,
  changes: { status: { from: "open", to: "in_progress" } },
});
const onB = logEvent({
  kind: "epic.create",
  issue: undefined,
  epic: { id: "ep-2", title: "A session starts warm" },
  at: now - DAY,
  revision: undefined,
});

const waitingBlocker: WaitingBlocker = {
  id: "bl-4",
  title: "name the day the page goes live",
  blockerKind: "decision",
  owner: "balder",
  status: "waiting",
  raisedAt: now - 2 * HOUR,
  raisedBy: { name: "balder/claude" },
  issues: [
    { id: "cn-21", title: "put the page on a public URL" },
    { id: "cn-9", title: "the page's live feed" },
  ],
};

/** An issue as a list carries it, held by this session. */
const listed: Listed = {
  id: "cn-26",
  title: "apps/web, the read-only window",
  status: "in_progress",
  priority: 2,
  claimedBy: { name: "balder/claude" },
  epic: { id: "ep-4", title: "Humans in the loop" },
  type: "task",
};

/** The same, as a row on its epic's own page, which does not repeat the epic. */
const { epic: _, ...bare } = listed;

/** A finished one, folded away on the issues page. */
const done: Listed = {
  ...listed,
  id: "cn-23",
  title: "the skeleton",
  status: "closed",
  claimedBy: undefined,
};

/** The epic `listed` is under. */
const parent = epic({
  id: "ep-4",
  title: "Humans in the loop",
  counts: { open: 0, inProgress: 1, closed: 0, dropped: 0, followUps: 0 },
});

/** An event on cn-25, an hour ago, by this session. */
const event = (over: Partial<Parameters<typeof logEvent>[0]>) =>
  logEvent({
    issue: { id: "cn-25", title: "clock-dependent lines go stale under a subscription" },
    ...over,
  });

const closed = event({
  kind: "issue.close",
  revision: 3,
  changes: {
    status: { from: "in_progress", to: "closed" },
    verification: { to: "vp run verify (exit 0)" },
  },
});
const long = event({
  kind: "issue.update",
  changes: {
    title: { from: "a".repeat(50), to: "b".repeat(50) },
    priority: { from: 2, to: 1 },
  },
});
const noted = event({
  kind: "journal.append",
  revision: undefined,
  changes: { kind: "finding", body: "the counter row is created on first use\nand why" },
});
const linked = event({
  kind: "edge.add",
  revision: undefined,
  changes: { type: "blocks", from: "cn-21", to: "cn-25" },
});
const raised = event({
  kind: "blocker.raise",
  revision: undefined,
  changes: {
    id: "bl-4",
    blockerKind: "decision",
    owner: "balder",
    title: "name the day",
    whatResolves: "a date",
    issue: "cn-25",
  },
  blocker: { id: "bl-4", title: "name the day" },
});
const created = event({ kind: "issue.create", changes: { title: { to: "x" } } });
const unnamed = event({ kind: "project.create", issue: undefined });

const updated: HistoryEvent = {
  at: now - 2 * HOUR,
  actor: agent,
  kind: "issue.update",
  revision: 4,
  changes: { priority: { from: 2, to: 1 } },
};
const edge: HistoryEvent = {
  at: now - HOUR,
  actor: agent,
  kind: "edge.add",
  changes: { type: "blocks", from: "cn-21", to: "cn-25" },
};

/** An issue with one journal entry, as `cn show` carries it. */
const journaled = issue({
  journal: [{ author: agent, kind: "decision", body: "rows, not lines", at: now - 3 * HOUR }],
});

type Pin = {
  name: string;
  element: ReactElement;
  /** cn's lines, which the element's whole text reads as, in order. */
  text?: string[];
  /** cn's lines, one to a row of the element's lists, in order. */
  rows?: string[];
};

const PINS: Pin[] = [
  {
    name: "an epic's health block",
    element: <Epics epics={[busy]} events={[]} issues={[]} now={now} />,
    text: healthLines(busy, now),
    rows: healthLines(busy, now).slice(1),
  },
  {
    name: "an epic's health block, with its description under the head line",
    element: <Epics epics={[described]} events={[]} issues={[]} now={now} />,
    text: [
      healthLines(described, now)[0]!,
      "what this epic is for",
      ...healthLines(described, now).slice(1),
    ],
    rows: healthLines(described, now).slice(1),
  },
  {
    name: "an epic with nothing moving stands as the latest, its first line alone",
    element: <Epics epics={[still]} events={[]} issues={[]} now={now} />,
    text: [healthLines(still, now)[0]!],
  },
  {
    name: "with nothing live, the two epics touched last stand above the rest, each with the newest line that landed in it",
    element: <Epics epics={[c, b, a]} events={[onA, onB]} issues={[underA]} now={now} />,
    text: [
      healthLines(a, now)[0]!,
      "every verb prints its lines",
      logLine(onA, now),
      healthLines(b, now)[0]!,
      logLine(onB, now),
      "Nothing moving",
      healthLines(c, now)[0]!,
    ],
    rows: [healthLines(c, now)[0]!],
  },
  {
    name: "what waits on a person",
    element: <Waiting blockers={[waitingBlocker]} now={now} />,
    text: ["Waiting on you", blockerLine(waitingBlocker, now), holdsLine(waitingBlocker.issues)],
  },
  {
    name: "a row of a list of issues",
    element: <IssueRows issues={[listed]} />,
    text: [issueLine(listed)],
    rows: [issueLine(listed)],
  },
  {
    name: "the issues page, grouped, the finished folded",
    element: <IssuesPage issues={[listed, done]} />,
    text: [
      "Issues",
      "1 live of 2, by priority then age, the way cn list orders them.",
      "In progress 1",
      issueLine(listed),
      "Closed 1",
      issueLine(done),
    ],
    rows: [issueLine(listed), issueLine(done)],
  },
  {
    name: "an epic's page: its state, then its issues without the epic",
    element: <EpicPage epic={parent} issues={[listed]} now={now} />,
    text: [
      "Overview",
      `${parent.id} Copy reference ? ${parent.title}`,
      `${epicWord(parent)} ${countsRun(parent.counts)}`,
      "In progress 1",
      issueLine(bare),
    ],
    rows: [issueLine(bare)],
  },
  {
    name: "the log page",
    element: <LogPage events={[closed]} now={now} />,
    text: ["Log", "Everything cn wrote to this deployment, newest first.", logLine(closed, now)],
    rows: [logLine(closed, now)],
  },
  ...Object.entries({ closed, long, noted, linked, raised, created, unnamed }).map(
    ([which, e]): Pin => ({
      name: `an event in the feed (${which})`,
      element: <FeedEvent event={e} now={now} />,
      text: [logLine(e, now)],
    }),
  ),
  {
    name: "an entry of a thing's own history",
    element: <HistoryEntry event={updated} now={now} />,
    text: [historyLines([updated], now)[0]!],
  },
  {
    name: "an edge in a history, read from that end",
    element: <HistoryEntry event={edge} now={now} self="cn-25" />,
    text: [historyLines([edge], now, "cn-25")[0]!],
  },
  {
    name: "a journal entry",
    element: <JournalEntry entry={journaled.journal[0]!} now={now} />,
    text: [
      brief(journaled, now)
        .split("\n")
        .find((l) => l.includes("decision:"))!,
    ],
  },
  {
    name: "the rail's epics",
    element: <Rail host="h" epics={[busy, still]} theme="light" onToggleTheme={() => {}} />,
    rows: [ref(busy), ref(still)],
  },
  {
    name: "a row of the jump bar",
    element: <JumpRow id="cn-26" title="apps/web, the read-only window" what="issue" />,
    text: [`${ref({ id: "cn-26", title: "apps/web, the read-only window" })} issue`],
  },
  {
    name: "the jump bar's row for a typed id",
    element: <JumpRow {...withTyped("ep-9", [])[0]!} />,
    text: ["ep-9 Open it by id"],
  },
];

describe("a row is one of cn's lines", () => {
  it.each(PINS.filter((p) => p.text))("$name reads as cn prints it", ({ element, text: lines }) =>
    expect(text(element)).toBe(lines!.map(squeeze).join(" ")),
  );

  it.each(PINS.filter((p) => p.rows))("$name sets a line to a row", ({ element, rows: lines }) =>
    expect(rows(element)).toEqual(lines!.map(squeeze)),
  );
});

describe("what the lines carry", () => {
  it("reads a journal entry as its kind and first line", () => {
    expect(text(<FeedEvent event={noted} now={now} />)).toContain(
      "finding: the counter row is created on first use…",
    );
  });

  it("reads an edge from the end the line leads with", () => {
    expect(text(<FeedEvent event={linked} now={now} />)).toContain("blocked by cn-21");
    expect(text(<HistoryEntry event={edge} now={now} self="cn-25" />)).toContain(
      "blocked by cn-21",
    );
  });

  it("reads a raised blocker as its line", () => {
    expect(text(<FeedEvent event={raised} now={now} />)).toContain(
      'bl-4 "name the day" decision · owner balder',
    );
  });

  it("links every reference in an epic's health to its own page", () => {
    const markup = renderToStaticMarkup(<Epics epics={[busy]} events={[]} issues={[]} now={now} />);
    for (const id of ["ep-4", "cn-26", "cn-10", "bl-4"]) expect(markup).toContain(`href="/${id}"`);
  });

  it("links each epic once whether it stands above or is listed, and never lists one twice", () => {
    const markup = renderToStaticMarkup(
      <Epics epics={[c, b, a]} events={[onA, onB]} issues={[underA]} now={now} />,
    );
    const count = (href: string) => markup.split(`href="${href}"`).length - 1;
    expect(count("/ep-7")).toBe(1);
    // ep-2 twice: its section's head line, and the Ref leading its last line, whose target
    // is the epic itself. ep-7's last line leads with its issue, /cn-9, instead.
    expect(count("/ep-2")).toBe(2);
    expect(count("/cn-9")).toBe(1);
    // ep-0 is listed under "Nothing moving" and nowhere above it.
    expect(count("/ep-0")).toBe(1);
  });

  it("sets an event's changes one to a row", () => {
    expect(renderToStaticMarkup(<FeedEvent event={closed} now={now} />).match(/<li/g)).toHaveLength(
      3,
    );
  });

  it("is not there at all when nothing waits", () => {
    expect(renderToStaticMarkup(<Waiting blockers={[]} now={now} />)).toBe("");
  });

  it("folds away what is finished on the issues page, and only that", () => {
    const markup = renderToStaticMarkup(<IssuesPage issues={[listed, done]} />);
    expect(markup.match(/<details/g)).toHaveLength(1);
    expect(markup.match(/<summary/g)).toHaveLength(1);
    const folded = markup.slice(markup.indexOf("<details"));
    expect(folded).toContain("Closed");
    expect(folded).not.toContain("In progress");
  });
});
