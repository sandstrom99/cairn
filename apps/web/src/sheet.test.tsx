// The pin, for the pages of one id: what the page sets as a table, a list or a column is
// what `cn show` prints for the same view, in its words and its order. The page goes
// further than the brief in one place only, by design: text the brief cuts to a first line,
// and the output a proof stored, is printed whole.
import {
  type HistoryEvent,
  type ShownBlocker,
  type ShownIssue,
  brief,
  historyLines,
  issueLine,
  stateLine,
  stateParts,
} from "@cairn/cli/src/lib/format.mts";
import { ref } from "@cairn/cli/src/lib/ref.mts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryEntry } from "./Feed.tsx";
import { IssueRows } from "./IssueRows.tsx";
import { BlockerPage, EpicPage, IssuePage, JournalEntry, type Listed } from "./ItemPages.tsx";
import { plain, squeeze } from "./plain.ts";

const now = Date.UTC(2026, 8, 21, 12, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const agent = { kind: "agent" as const, name: "balder/claude" };

const issue: ShownIssue = {
  kind: "issue",
  id: "cn-26",
  project: "cn",
  epic: { id: "ep-4", title: "Humans in the loop" },
  title: "apps/web, the read-only window",
  description: undefined,
  design: "On the skeleton.\n\nLines come from format.mts.",
  acceptance: "- The page lists open epics.\n- Nothing on the page calls a mutation.",
  type: "task",
  followUpKind: undefined,
  parent: undefined,
  requires: ["web"],
  status: "in_progress",
  priority: 2,
  claimedBy: agent,
  claimedAt: now - 2 * HOUR,
  lastActivity: now - HOUR,
  deferUntil: undefined,
  verification: undefined,
  droppedReason: undefined,
  closedAt: undefined,
  revision: 1,
  createdAt: now - DAY,
  stuck: false,
  journal: [{ author: agent, kind: "decision", body: "rows, not lines", at: now - 3 * HOUR }],
  blocks: [{ id: "cn-11", title: "the human channel", status: "open" }],
  blockedBy: [
    { id: "cn-23", title: "the skeleton", status: "closed" },
    { id: "cn-24", title: "the feed", status: "open" },
  ],
  related: [],
  discoveredFrom: [],
  duplicates: [],
  supersedes: [],
  waitingOn: [],
  followUps: [],
  events: undefined,
};

/** The brief's lines from the first labelled one down to where the long text begins. */
const factsOf = (text: string): string =>
  text
    .split("\n")
    .slice(1)
    .filter(
      (line) =>
        !/^(description|design|acceptance|journal|history)\b/.test(line) && !line.startsWith("  "),
    )
    .map(squeeze)
    .join(" ");

/** The page for an issue, as text. */
const page = (shown: ShownIssue): string =>
  plain(renderToStaticMarkup(<IssuePage issue={shown} siblings={[]} now={now} />));

/** The one line of state at the top of the page. */
const stateOf = (shown: ShownIssue): string => {
  const markup = renderToStaticMarkup(<IssuePage issue={shown} siblings={[]} now={now} />);
  return plain(markup.slice(markup.indexOf("</header>"), markup.indexOf('<div class="paper')));
};

describe("an issue's page", () => {
  const markup = renderToStaticMarkup(<IssuePage issue={issue} siblings={[]} now={now} />);

  it("sets cn show's labelled lines as its table, in cn's words and order", () => {
    const table = markup.slice(markup.indexOf("<dl"), markup.indexOf("</dl>"));
    expect(plain(table)).toBe(factsOf(brief(issue, now)));
    // A finished end of a blocking edge carries cn's word after its reference.
    expect(plain(table)).toContain('blocked by cn-23 "the skeleton" done, cn-24 "the feed"');
  });

  it("opens with the state line cn's status line opens with, for every state", () => {
    const states: ShownIssue[] = [
      issue,
      { ...issue, status: "open", claimedBy: undefined, claimedAt: undefined },
      { ...issue, status: "open", claimedBy: undefined, stuck: true, lastActivity: now - 9 * DAY },
      {
        ...issue,
        status: "open",
        claimedBy: undefined,
        waitingOn: [{ id: "bl-4", title: "name the day" }],
      },
      { ...issue, status: "open", claimedBy: undefined, blockedBy: [], deferUntil: now + 9 * DAY },
      { ...issue, status: "open", claimedBy: undefined, blockedBy: [] },
      { ...issue, status: "closed", claimedBy: undefined, closedAt: now - HOUR },
      {
        ...issue,
        status: "dropped",
        claimedBy: undefined,
        closedAt: now - HOUR,
        droppedReason: "no",
      },
    ];
    expect(states.map(stateOf)).toEqual(states.map((s) => squeeze(stateLine(stateParts(s, now)))));
    expect(states.map(stateOf)).toEqual([
      "moving balder/claude 2h",
      'blocked by cn-24 "the feed"',
      "stuck silent 9d",
      'waiting on bl-4 "name the day"',
      "deferred until 2026-09-30",
      "open",
      "closed 1h ago",
      "dropped 1h ago",
    ]);
  });

  it("prints in full what the brief cuts to a first line", () => {
    expect(brief(issue, now)).toContain("On the skeleton.…");
    expect(plain(markup)).toContain("On the skeleton. Lines come from format.mts.");
    expect(markup.match(/<li>/g)).toHaveLength(2);
  });

  it("opens with the way up to its epic and offers the reference to copy", () => {
    expect(markup).toContain('href="/ep-4"');
    expect(plain(markup)).toContain("Copy reference");
  });

  it("links what the state names", () => {
    const held = {
      ...issue,
      status: "open" as const,
      claimedBy: undefined,
      waitingOn: [{ id: "bl-4", title: "name the day" }],
    };
    const markup = renderToStaticMarkup(<IssuePage issue={held} siblings={[]} now={now} />);
    expect(markup.slice(0, markup.indexOf("<dl"))).toContain('href="/bl-4"');
  });

  it("steps to the issue before and the one after, in the epic's order", () => {
    const siblings = [
      { id: "cn-25", title: "before" },
      { id: "cn-26", title: issue.title },
      { id: "cn-11", title: "after" },
    ];
    const stepped = renderToStaticMarkup(<IssuePage issue={issue} siblings={siblings} now={now} />);
    expect(stepped).toContain('href="/cn-25"');
    expect(stepped).toContain('href="/cn-11"');
    expect(plain(stepped)).toContain("2 of 3");
  });

  it("prints the proof a close stored as cn's line, and what the command said in full", () => {
    const closed: ShownIssue = {
      ...issue,
      status: "closed",
      claimedBy: undefined,
      closedAt: now - HOUR,
      verification: {
        command: "vp run verify",
        exitCode: 0,
        output: "Test Files  33 passed\n      Tests  227 passed",
        at: now - HOUR,
        by: agent,
      },
    };
    const line = brief(closed, now)
      .split("\n")
      .find((l) => l.startsWith("proof"))!;
    expect(line).toBe("proof           vp run verify (exit 0) by balder/claude 1h ago");
    const text = page(closed);
    expect(text).toContain(squeeze(line));
    expect(text).toContain("output Test Files 33 passed Tests 227 passed");
    expect(brief(closed, now)).not.toContain("33 passed");
  });

  it("prints the reason a drop gave as cn's line", () => {
    const dropped: ShownIssue = {
      ...issue,
      status: "dropped",
      claimedBy: undefined,
      closedAt: now - HOUR,
      droppedReason: "superseded by cn-30",
    };
    expect(brief(dropped, now)).toContain("reason          superseded by cn-30");
    expect(page(dropped)).toContain("reason superseded by cn-30");
  });

  it("prints the description in full, where the brief keeps its first line", () => {
    const described: ShownIssue = {
      ...issue,
      description:
        "Balder, 2026-09-21: the journal is the most context an issue has.\n\nSo show it.",
    };
    expect(brief(described, now)).toContain(
      "description     Balder, 2026-09-21: the journal is the most context an issue has.…",
    );
    expect(page(described)).toContain(
      "description Balder, 2026-09-21: the journal is the most context an issue has. So show it.",
    );
  });
});

describe("a journal entry", () => {
  it("reads as cn show prints it", () => {
    const entry = issue.journal[0]!;
    const line = brief(issue, now)
      .split("\n")
      .find((l) => l.includes("decision:"))!;
    expect(plain(renderToStaticMarkup(<JournalEntry entry={entry} now={now} />))).toBe(
      squeeze(line),
    );
  });
});

describe("a row of a list of issues", () => {
  const listed: Listed = {
    id: "cn-26",
    title: "apps/web, the read-only window",
    status: "in_progress",
    priority: 2,
    claimedBy: { name: "balder/claude" },
    epic: { id: "ep-4", title: "Humans in the loop" },
    type: "task",
  };

  it("reads as cn list prints it, the epic included where the list spans epics", () => {
    expect(plain(renderToStaticMarkup(<IssueRows issues={[listed]} />))).toBe(
      squeeze(issueLine(listed)),
    );
  });

  it("drops the epic on the epic's own page, as cn show ep-4 does", () => {
    const epic = {
      kind: "epic" as const,
      id: "ep-4",
      title: "Humans in the loop",
      description: undefined,
      status: "open" as const,
      revision: 0,
      createdAt: now - DAY,
      counts: { open: 0, inProgress: 1, closed: 0, dropped: 0, followUps: 0 },
      lastReconciledAt: undefined,
      health: { moving: [], stuck: undefined, waiting: [] },
      issues: [],
    };
    const markup = renderToStaticMarkup(<EpicPage epic={epic} issues={[listed]} now={now} />);
    const rows = markup.slice(markup.lastIndexOf("<ul"));
    const { epic: _, ...bare } = listed;
    expect(plain(rows)).toBe(squeeze(issueLine(bare)));
  });
});

describe("an entry of a thing's own history", () => {
  it("reads as cn show --history prints it", () => {
    const event: HistoryEvent = {
      at: now - 2 * HOUR,
      actor: agent,
      kind: "issue.update",
      revision: 4,
      changes: { priority: { from: 2, to: 1 } },
    };
    expect(plain(renderToStaticMarkup(<HistoryEntry event={event} now={now} />))).toBe(
      squeeze(historyLines([event], now)[0]!),
    );
  });
});

describe("a blocker's page", () => {
  const blocker: ShownBlocker = {
    kind: "blocker",
    id: "bl-4",
    title: "name the day the sweep turns on",
    blockerKind: "decision",
    owner: "balder",
    whatResolves: "a date on or after 2026-09-24",
    nudgeAt: undefined,
    status: "raised",
    raisedBy: agent,
    raisedAt: now - 2 * HOUR,
    resolvedBy: undefined,
    resolvedAt: undefined,
    resolution: undefined,
    revision: 0,
    issues: [{ id: "cn-21", title: "turn the reconcile sweep on" }],
    events: undefined,
  };

  it("sets cn show's lines for it as its table", () => {
    const markup = renderToStaticMarkup(<BlockerPage blocker={blocker} now={now} />);
    const table = markup.slice(markup.indexOf("<dl"), markup.indexOf("</dl>"));
    expect(plain(table)).toBe(factsOf(brief(blocker, now)));
    expect(plain(markup)).toContain(ref(blocker.issues[0]!));
  });
});
