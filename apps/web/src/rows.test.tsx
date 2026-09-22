// The pin: a row on the page is one of cn's lines, typeset. Each test renders the row and
// the line from the same view and holds the row's text to the line, give or take the
// padding cn uses for columns. A word changed in format.mts changes both or fails here; a
// row that drops, reorders or rewords a piece of its line fails here.
//
// Rendered to a string rather than to a DOM, like everything in this suite.
import {
  type EpicLineView,
  type LogEvent,
  blockerLine,
  healthLines,
  holdsLine,
  logLine,
} from "@cairn/cli/src/lib/format.mts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeedEvent } from "./Feed.tsx";
import { Epics, Waiting, type WaitingBlocker } from "./Overview.tsx";
import { plain, squeeze } from "./plain.ts";

const now = Date.UTC(2026, 8, 21, 12, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const epic = (over: Partial<EpicLineView> & Pick<EpicLineView, "id" | "title">): EpicLineView => ({
  counts: { open: 0, inProgress: 0, closed: 0, followUps: 0 },
  health: { moving: [], waiting: [] },
  ...over,
});

/** The rows of one rendered block, a line each, by the element that closes a row. */
const rowsOf = (markup: string, closing: string): string[] =>
  markup
    .split(closing)
    .map(plain)
    .filter((row) => row !== "");

describe("an epic's health block", () => {
  const busy = epic({
    id: "ep-4",
    title: 'Humans in the "loop"',
    counts: { open: 1, inProgress: 1, closed: 5, followUps: 1 },
    health: {
      moving: [
        {
          id: "cn-26",
          title: "apps/web, the read-only window",
          claimedBy: { name: "balder/claude" },
          claimedAt: now - 2 * HOUR,
        },
      ],
      stuck: { id: "cn-10", title: "Invyte runs on cairn", lastActivity: now - 9 * DAY },
      waiting: [{ id: "bl-4", title: "name the day", owner: "balder" }],
    },
  });

  it("reads as the lines cn epic list prints, header and every fact", () => {
    const markup = renderToStaticMarkup(<Epics epics={[busy]} now={now} />);
    const [header, ...facts] = healthLines(busy, now).map(squeeze);
    expect(plain(markup)).toBe([header, ...facts].join(" "));
    // And a fact to a row, not only the same words in the same order.
    expect(rowsOf(markup.slice(markup.indexOf("<ul")), "</li>")).toEqual(facts);
  });

  it("prints an epic with nothing moving as its first line alone", () => {
    const still = epic({ id: "ep-0", title: "Inbox" });
    const markup = renderToStaticMarkup(<Epics epics={[still]} now={now} />);
    expect(plain(markup)).toBe(`Nothing moving ${squeeze(healthLines(still, now)[0]!)}`);
  });

  it("links every reference to its own page", () => {
    const markup = renderToStaticMarkup(<Epics epics={[busy]} now={now} />);
    for (const id of ["ep-4", "cn-26", "cn-10", "bl-4"]) expect(markup).toContain(`href="/${id}"`);
  });
});

describe("what waits on a person", () => {
  const blocker: WaitingBlocker = {
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

  it("reads as cn waiting prints it: the blocker's line, then what it holds", () => {
    const markup = renderToStaticMarkup(<Waiting blockers={[blocker]} now={now} />);
    expect(plain(markup)).toBe(
      `Waiting on you ${squeeze(blockerLine(blocker, now))} ${squeeze(holdsLine(blocker.issues))}`,
    );
  });

  it("is not there at all when nothing waits", () => {
    expect(renderToStaticMarkup(<Waiting blockers={[]} now={now} />)).toBe("");
  });
});

describe("an event in the feed", () => {
  const event = (over: Partial<LogEvent>): LogEvent => ({
    at: now - 4 * 60_000,
    actor: { kind: "agent", name: "balder/claude" },
    kind: "issue.close",
    revision: 3,
    changes: undefined,
    issue: { id: "cn-25", title: "clock-dependent lines go stale under a subscription" },
    epic: undefined,
    blocker: undefined,
    ...over,
  });

  it("reads as the line cn log prints, the changes one to a row", () => {
    const closed = event({
      changes: {
        status: { from: "in_progress", to: "closed" },
        verification: { to: "vp run verify (exit 0)" },
      },
    });
    const markup = renderToStaticMarkup(<FeedEvent event={closed} now={now} />);
    expect(plain(markup)).toBe(squeeze(logLine(closed, now)));
    expect(markup.match(/<li/g)).toHaveLength(3);
  });

  it("cuts a long payload exactly where the line does", () => {
    const long = event({
      kind: "issue.update",
      changes: {
        title: { from: "a".repeat(50), to: "b".repeat(50) },
        priority: { from: 2, to: 1 },
      },
    });
    expect(plain(renderToStaticMarkup(<FeedEvent event={long} now={now} />))).toBe(
      squeeze(logLine(long, now)),
    );
  });

  it("reads a journal entry as its kind and first line, and an edge from the end the line leads with", () => {
    const noted = event({
      kind: "journal.append",
      revision: undefined,
      changes: { kind: "finding", body: "the counter row is created on first use\nand why" },
    });
    const notedMarkup = plain(renderToStaticMarkup(<FeedEvent event={noted} now={now} />));
    expect(notedMarkup).toBe(squeeze(logLine(noted, now)));
    expect(notedMarkup).toContain("finding: the counter row is created on first use…");
    const linked = event({
      kind: "edge.add",
      revision: undefined,
      changes: { type: "blocks", from: "cn-21", to: "cn-25" },
    });
    const linkedMarkup = plain(renderToStaticMarkup(<FeedEvent event={linked} now={now} />));
    expect(linkedMarkup).toBe(squeeze(logLine(linked, now)));
    expect(linkedMarkup).toContain("blocked by cn-21");
  });

  it("reads a raised blocker as its line", () => {
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
    const raisedMarkup = plain(renderToStaticMarkup(<FeedEvent event={raised} now={now} />));
    expect(raisedMarkup).toBe(squeeze(logLine(raised, now)));
    expect(raisedMarkup).toContain('bl-4 "name the day" decision · owner balder');
  });

  it("prints a create with no payload, and an event that names nothing with a dash", () => {
    const created = event({ kind: "issue.create", changes: { title: { to: "x" } } });
    expect(plain(renderToStaticMarkup(<FeedEvent event={created} now={now} />))).toBe(
      squeeze(logLine(created, now)),
    );
    const unnamed = event({ kind: "project.create", issue: undefined });
    expect(plain(renderToStaticMarkup(<FeedEvent event={unnamed} now={now} />))).toBe(
      squeeze(logLine(unnamed, now)),
    );
  });
});
