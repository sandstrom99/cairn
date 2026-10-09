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
  listLine,
  logLine,
  projectLines,
} from "@cairn/cli/lines";
import { countsRun } from "@cairn/cli/parts";
import { ref } from "@cairn/cli/ref";
import {
  DAY,
  HOUR,
  agent,
  briefView,
  epic,
  issue,
  logEvent,
  now,
  project,
} from "@cairn/cli/testing";
import type { HistoryEvent } from "@cairn/cli/views";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeedEvent, HistoryEntry } from "./Feed.tsx";
import { EpicPage, JournalEntry } from "./ItemPages.tsx";
import { JumpRow, withTyped } from "./JumpBar.tsx";
import { IssuesPage, LogPage } from "./ListPages.tsx";
import { Epics, Moving, Stuck, UpNext, Waiting, type WaitingBlocker } from "./Overview.tsx";
import { squeeze } from "./plain.ts";
import { ProjectHead, ProjectsPage } from "./ProjectPages.tsx";
import { typesetting } from "./Prose.tsx";
import { Rail } from "./Rail.tsx";
import { IssueRows, type Listed } from "./rows.tsx";
import { rows, text } from "./testing.tsx";
import { epicWord } from "./tone.tsx";

// The page's passages are set once Markdown.tsx is in (Prose.tsx).
await typesetting;

const busy = epic({
  id: "ep-4",
  title: 'Humans in the "loop"',
  counts: {
    open: 1,
    inProgress: 1,
    closed: 5,
    dropped: 0,
    followUps: 1,
    recent: { days: 28, filed: 0, done: 0 },
  },
  health: {
    moving: [
      {
        id: "cn-26",
        title: "apps/web, the read-only window",
        claimedBy: { name: "harbor/claude", kind: "agent" },
        claimedAt: now - 2 * HOUR,
      },
    ],
    stuck: [{ id: "cn-10", title: "Northwind runs on cairn", lastActivity: now - 9 * DAY }],
    waiting: [{ id: "bl-4", title: "name the day", owner: "harbor" }],
  },
});

/** An epic with five stuck issues: three named, and the rest counted in a row of its own. */
const crowded = epic({
  id: "ep-6",
  title: "The page shows what is stuck",
  counts: {
    open: 5,
    inProgress: 0,
    closed: 1,
    dropped: 0,
    followUps: 0,
    recent: { days: 28, filed: 0, done: 0 },
  },
  health: {
    moving: [],
    stuck: [9, 4, 8, 6, 5].map((days, i) => ({
      id: `cn-${30 + i}`,
      title: `stuck ${i + 1}`,
      lastActivity: now - days * DAY,
    })),
    waiting: [{ id: "bl-4", title: "name the day", owner: "harbor" }],
  },
});

const still = epic({ id: "ep-0", title: "Inbox" });

/** `busy` with the sentence that says when it is reached, which stands first under its head. */
const promised = { ...busy, id: "ep-9", doneWhen: "a person steers every agent from the page" };

/** A stream with nothing moving: its head counts the last 28 days, and it has no done-when. */
const flowing = epic({
  id: "ep-10",
  title: "Scout findings, each fixed or decided",
  type: "stream",
  counts: {
    open: 2,
    inProgress: 0,
    closed: 9,
    dropped: 0,
    followUps: 1,
    recent: { days: 28, filed: 3, done: 2 },
  },
});

/** Two outcomes with nothing moving: a done-when is always there, so neither is live. */
const settled = epic({ id: "ep-11", title: "Invites open the app", doneWhen: "a link opens it" });
const parked = epic({ id: "ep-12", title: "The rail counts", doneWhen: "every count is live" });

/** `busy` with a description, which stands between its head line and its rows. */
const described = { ...busy, id: "ep-5", description: "what this epic is for" };

/** `busy` with a description that is a map: a heading, then the rest. The block shows its first line. */
const mapped = {
  ...busy,
  id: "ep-8",
  description: "## The wayfinder map\n\nThe epic is the map; its open issues are the tickets.",
};

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
  project: "cn",
  lastActivity: now - HOUR,
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
  owner: "harbor",
  status: "waiting",
  raisedAt: now - 2 * HOUR,
  raisedBy: { name: "harbor/claude" },
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
  claimedBy: { name: "harbor/claude" },
  epic: { id: "ep-4", title: "Humans in the loop" },
  type: "task",
  project: "cn",
  lastActivity: now - HOUR,
  revision: 3,
};

/** The same, as a row on its epic's own page, which does not repeat the epic. */
const { epic: _, ...bare } = listed;

/** Two ready issues as the brief heads them, for Up next: open, unclaimed, by priority. */
const ready1 = {
  id: "cn-27",
  title: "the overview lists what is ready",
  status: "open" as const,
  priority: 1,
  epic: { id: "ep-4", title: "Humans in the loop" },
  revision: 0,
  lastActivity: now - HOUR,
};
const ready2 = { ...ready1, id: "cn-28", title: "the overview at scale", priority: 2 };
const upNext = [ready1, ready2].map((row) => issueLine(row));

/** What Moving lists: a claim the brief heads, then a close of the last two days. */
const held = {
  ...ready1,
  id: "cn-26",
  title: "apps/web, the read-only window",
  status: "in_progress" as const,
  revision: 3,
  claimedBy: { name: "harbor/claude", kind: "agent" as const },
  claimedAt: now - 2 * HOUR,
  mine: false,
};
const landed = {
  ...ready1,
  id: "cn-25",
  title: "the brief names what landed",
  status: "closed" as const,
  revision: 2,
  closedAt: now - 3 * HOUR,
};
const moving = briefView({ inProgress: [held], recent: { count: 4, top: [landed] } });

/** What Stuck lists: a P1 the queue offered for ten days with nobody taking it. */
const left = { ...ready1, id: "cn-3", title: "the retry", lastActivity: now - 10 * DAY };
const stuck = { ...left, silentSince: left.lastActivity };

/** A finished one, folded away on the issues page. */
const done: Listed = {
  ...listed,
  id: "cn-23",
  title: "the skeleton",
  status: "closed",
  claimedBy: undefined,
  closedAt: now - DAY,
};

/** A project with busy's health, four live issues, and one nothing is filed under. */
const filed = project({
  slug: "cn",
  name: "cairn: backend, cli, plugin",
  filed: 7,
  counts: {
    open: 2,
    inProgress: 1,
    closed: 3,
    dropped: 0,
    followUps: 1,
    recent: { days: 28, filed: 0, done: 0 },
  },
  health: busy.health,
});
const empty = project({ slug: "admin", name: "Driftwood admin, the harbour office app" });

/** `listed` as `cn list --silent` lists it, quiet two hours. */
const quiet = { ...listed, silentSince: now - 2 * HOUR };

/** The epic `listed` is under. */
const parent = epic({
  id: "ep-4",
  title: "Humans in the loop",
  counts: {
    open: 0,
    inProgress: 1,
    closed: 0,
    dropped: 0,
    followUps: 0,
    recent: { days: 28, filed: 0, done: 0 },
  },
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
    owner: "harbor",
    title: "name the day",
    whatResolves: "a date",
    issue: "cn-25",
  },
  blocker: { id: "bl-4", title: "name the day" },
});
const created = event({ kind: "issue.create", changes: { title: { to: "x" } } });
const unnamed = event({ kind: "project.create", issue: undefined });
const renamed = event({
  kind: "project.update",
  revision: 1,
  changes: { name: { from: "the app", to: "the app, renamed" } },
  issue: undefined,
  project: { id: "app", title: "the app, renamed" },
});

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
    name: "an epic's health block, the stuck past the first three counted",
    element: <Epics epics={[crowded]} events={[]} issues={[]} now={now} />,
    text: healthLines(crowded, now),
    rows: healthLines(crowded, now).slice(1),
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
    name: "an epic's health block, a description of more than a line cut to its first",
    element: <Epics epics={[mapped]} events={[]} issues={[]} now={now} />,
    text: [
      healthLines(mapped, now)[0]!,
      "The wayfinder map…",
      ...healthLines(mapped, now).slice(1),
    ],
    rows: healthLines(mapped, now).slice(1),
  },
  {
    name: "an outcome's health block, its done-when first under the head line",
    element: <Epics epics={[promised]} events={[]} issues={[]} now={now} />,
    text: healthLines(promised, now),
    rows: healthLines(promised, now).slice(1),
  },
  {
    name: "a stream's head, its window in place of an all-time done",
    element: <Epics epics={[flowing]} events={[]} issues={[]} now={now} />,
    text: [healthLines(flowing, now)[0]!],
  },
  {
    name: "an epic with nothing moving stands as the latest, its first line alone",
    element: <Epics epics={[still]} events={[]} issues={[]} now={now} />,
    text: [healthLines(still, now)[0]!],
  },
  {
    name: "an outcome with nothing moving stands as the latest, its done-when under its head",
    element: <Epics epics={[settled]} events={[]} issues={[]} now={now} />,
    text: healthLines(settled, now),
    rows: healthLines(settled, now).slice(1),
  },
  {
    name: "outcomes whose one row is their done-when are listed under Nothing moving, not as live",
    element: <Epics epics={[busy, settled, parked]} events={[]} issues={[]} now={now} />,
    text: [
      ...healthLines(busy, now),
      "Nothing moving",
      healthLines(settled, now)[0]!,
      healthLines(parked, now)[0]!,
    ],
    rows: [
      ...healthLines(busy, now).slice(1),
      healthLines(settled, now)[0]!,
      healthLines(parked, now)[0]!,
    ],
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
    name: "moving: what is held then what landed, both counted, the brief's lines as rows",
    element: <Moving view={moving} now={now} />,
    text: ["Moving 5", issueLine(held), issueLine(landed)],
    rows: [issueLine(held), issueLine(landed)],
  },
  {
    name: "stuck: the brief's stuck heads as cn list --silent lists them",
    element: <Stuck view={briefView({ stuck: { count: 2, top: [stuck] } })} now={now} />,
    text: ["Stuck 2", listLine(stuck, now)],
    rows: [listLine(stuck, now)],
  },
  {
    name: "up next: the ready count beside the title, and cn ready's lines as rows",
    element: <UpNext view={briefView({ ready: { count: 7, top: [ready1, ready2] } })} />,
    text: ["Up next 7", ...upNext],
    rows: upNext,
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
    name: "an epic's page: its state, its track, then its issues without the epic",
    element: <EpicPage epic={parent} issues={[listed]} now={now} />,
    text: [
      "Overview",
      `${parent.id} Copy reference ? ${parent.title}`,
      `${epicWord(parent)} ${countsRun(parent.counts)}`,
      "1 moving no closes in 4 weeks 4 weeks ago today",
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
  ...Object.entries({ closed, long, noted, linked, raised, created, unnamed, renamed }).map(
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
    name: "a project's head line on Projects",
    element: <ProjectHead project={filed} now={now} />,
    text: [projectLines(filed, now)[0]!],
  },
  {
    name: "a project's section on Projects sets a health line to a row",
    element: <ProjectsPage projects={[filed]} issues={[]} blockers={[]} now={now} />,
    rows: projectLines(filed, now).slice(1),
  },
  {
    name: "a project nothing is filed under",
    element: <ProjectHead project={empty} now={now} />,
    text: [projectLines(empty, now)[0]!],
  },
  {
    name: "a project nothing is filed under has no row on Projects",
    element: <ProjectsPage projects={[empty]} issues={[]} blockers={[]} now={now} />,
    rows: [],
  },
  {
    name: "a row of a list with its silence",
    element: <IssueRows issues={[quiet]} now={now} meter="moving" />,
    text: [listLine(quiet, now)],
    rows: [listLine(quiet, now)],
  },
  {
    name: "the rail's projects",
    element: (
      <Rail host="h" epics={[]} projects={[filed, empty]} theme="light" onToggleTheme={() => {}} />
    ),
    rows: ["cn 4", "admin"],
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
  it("draws nothing under Up next with nothing ready", () => {
    expect(renderToStaticMarkup(<UpNext view={briefView()} />)).toBe("");
  });

  it("draws nothing for Moving or Stuck with nothing in either", () => {
    expect(renderToStaticMarkup(<Moving view={briefView()} now={now} />)).toBe("");
    expect(renderToStaticMarkup(<Stuck view={briefView()} now={now} />)).toBe("");
  });

  it("counts closes past the heads under Moving, with nothing in progress", () => {
    const view = briefView({ recent: { count: 6, top: [landed] } });
    expect(text(<Moving view={view} now={now} />)).toBe(`Moving 6 ${squeeze(issueLine(landed))}`);
  });

  it("draws a stuck row's silence against its priority's limit", () => {
    const markup = renderToStaticMarkup(
      <Stuck view={briefView({ stuck: { count: 1, top: [stuck] } })} now={now} />,
    );
    expect(markup).toContain('title="silent 10d"');
  });

  it("stands the live epics newest activity first", () => {
    const newer = { ...busy, id: "ep-13", title: "touched an hour ago", lastActivity: now - HOUR };
    const older = { ...busy, lastActivity: now - 2 * DAY };
    const markup = renderToStaticMarkup(
      <Epics epics={[older, newer]} events={[]} issues={[]} now={now} />,
    );
    expect(markup.indexOf('href="/ep-13"')).toBeGreaterThan(-1);
    expect(markup.indexOf('href="/ep-13"')).toBeLessThan(markup.indexOf('href="/ep-4"'));
  });

  it("draws an epic's counts as a bar beside the text, each segment its share, the text its title", () => {
    const markup = renderToStaticMarkup(<Epics epics={[busy]} events={[]} issues={[]} now={now} />);
    const bar = markup.match(
      /<span[^>]*title="5 done · 2 open · 1 follow-up"[^>]*>(.*?)<\/span>/,
    )?.[1];
    expect(bar).toBeDefined();
    expect([...bar!.matchAll(/flex-grow:(\d+)/g)].map((m) => m[1])).toEqual(["5", "2", "1"]);
    expect(bar).toContain("hatch");
  });

  it("draws a stream's done as its window's, the number its text names", () => {
    const markup = renderToStaticMarkup(
      <Epics epics={[flowing]} events={[]} issues={[]} now={now} />,
    );
    const bar = markup.match(
      /<span[^>]*title="stream · 2 open · 1 follow-up · 28d: 3 filed, 2 done"[^>]*>(.*?)<\/span>/,
    )?.[1];
    expect(bar).toBeDefined();
    expect([...bar!.matchAll(/flex-grow:(\d+)/g)].map((m) => m[1])).toEqual(["2", "2", "1"]);
  });

  it("draws an epic with nothing counted as one hairline", () => {
    const markup = renderToStaticMarkup(
      <Epics epics={[still]} events={[]} issues={[]} now={now} />,
    );
    const bar = markup.match(
      /<span[^>]*title="0 done · 0 open · 0 follow-ups"[^>]*>(.*?)<\/span>/,
    )?.[1];
    expect(bar).toMatch(/^<b [^>]*><\/b>$/);
    expect(bar).not.toContain("flex-grow");
  });

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
      'bl-4 "name the day" decision · owner harbor',
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

describe("the rail's head", () => {
  it("reads the deployment's own name as the big word, with the host under it", () => {
    expect(
      text(<Rail name="driftwood" host="h" epics={[]} theme="light" onToggleTheme={() => {}} />),
    ).toMatch(/^driftwood h /);
  });

  it("reads cairn where no name is recorded", () => {
    expect(text(<Rail host="h" epics={[]} theme="light" onToggleTheme={() => {}} />)).toMatch(
      /^cairn h /,
    );
  });
});
