// The pin, for the pages of one id: what the page sets as a table, a list or a column is
// what `cn show` prints for the same view, in its words and its order. The page goes
// further than the brief in one place only, by design: text the brief cuts to a first line,
// and the output a proof stored, is printed whole.
import { brief, linkLine } from "@cairn/cli/lines";
import { blockerFacts, linkParts, stateLine, stateParts } from "@cairn/cli/parts";
import { JOURNAL_HEAD, JOURNAL_MAX } from "@cairn/backend/convex/lib/limits.js";
import { DAY, HOUR, agent, blocker, epic, issue, now } from "@cairn/cli/testing";
import type { ShownIssue } from "@cairn/cli/views";
import { ref } from "@cairn/cli/ref";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlockerPage, EpicPage, IssuePage } from "./ItemPages.tsx";
import { plain, squeeze } from "./plain.ts";

/** The issue the page is opened on: held by this session, with an edge each way. */
const held = issue({
  id: "cn-26",
  epic: { id: "ep-4", title: "Humans in the loop" },
  title: "apps/web, the read-only window",
  design: "On the skeleton.\n\nLines come from lines.mts.",
  acceptance: "- The page lists open epics.\n- Nothing on the page calls a mutation.",
  requires: ["web"],
  status: "in_progress",
  priority: 2,
  claimedBy: agent,
  claimedAt: now - 2 * HOUR,
  revision: 1,
  createdAt: now - DAY,
  journal: [{ author: agent, kind: "decision", body: "rows, not lines", at: now - 3 * HOUR }],
  blocks: [{ id: "cn-11", title: "the human channel", status: "open" }],
  blockedBy: [
    { id: "cn-23", title: "the skeleton", status: "closed" },
    { id: "cn-24", title: "the feed", status: "open" },
  ],
});

/**
 * The brief's lines from the first labelled one down to where the long text begins. A
 * journal or history entry is indented two and then written; a fact's second link is
 * indented the whole label column, so only the first kind is dropped.
 */
const factsOf = (text: string): string =>
  text
    .split("\n")
    .slice(1)
    .filter(
      (line) =>
        !/^(description|design|acceptance|journal|history)\b/.test(line) && !/^ {2}\S/.test(line),
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
  const markup = renderToStaticMarkup(<IssuePage issue={held} siblings={[]} now={now} />);

  it("sets cn show's labelled lines as its table, in cn's words and order", () => {
    const table = markup.slice(markup.indexOf("<dl"), markup.indexOf("</dl>"));
    expect(plain(table)).toBe(factsOf(brief(held, now)));
    // A finished end of a blocking edge carries cn's word after its reference.
    expect(plain(table)).toContain('blocked by cn-23 "the skeleton" done, cn-24 "the feed"');
  });

  it("opens with the state line cn's status line opens with, for every state", () => {
    const states: ShownIssue[] = [
      held,
      { ...held, status: "open", claimedBy: undefined, claimedAt: undefined },
      { ...held, status: "open", claimedBy: undefined, stuck: true, lastActivity: now - 9 * DAY },
      {
        ...held,
        status: "open",
        claimedBy: undefined,
        waitingOn: [{ id: "bl-4", title: "name the day" }],
      },
      { ...held, status: "open", claimedBy: undefined, blockedBy: [], deferUntil: now + 9 * DAY },
      { ...held, status: "open", claimedBy: undefined, blockedBy: [] },
      { ...held, status: "closed", claimedBy: undefined, closedAt: now - HOUR },
      {
        ...held,
        status: "dropped",
        claimedBy: undefined,
        closedAt: now - HOUR,
        droppedReason: "no",
      },
    ];
    expect(states.map(stateOf)).toEqual(states.map((s) => squeeze(stateLine(stateParts(s, now)))));
    expect(states.map(stateOf)).toEqual([
      "moving wsl/claude 2h",
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
    expect(brief(held, now)).toContain("On the skeleton.…");
    expect(plain(markup)).toContain("On the skeleton. Lines come from lines.mts.");
    expect(markup.match(/<li>/g)).toHaveLength(2);
  });

  it("opens with the way up to its epic and offers the reference to copy", () => {
    expect(markup).toContain('href="/ep-4"');
    expect(plain(markup)).toContain("Copy reference");
    expect(markup).toContain('aria-label="Say to your agent"');
  });

  it("links what the state names", () => {
    const waiting = {
      ...held,
      status: "open" as const,
      claimedBy: undefined,
      waitingOn: [{ id: "bl-4", title: "name the day" }],
    };
    const markup = renderToStaticMarkup(<IssuePage issue={waiting} siblings={[]} now={now} />);
    expect(markup.slice(0, markup.indexOf("<dl"))).toContain('href="/bl-4"');
  });

  it("steps to the issue before and the one after, in the epic's order", () => {
    const siblings = [
      { id: "cn-25", title: "before" },
      { id: "cn-26", title: held.title },
      { id: "cn-11", title: "after" },
    ];
    const stepped = renderToStaticMarkup(<IssuePage issue={held} siblings={siblings} now={now} />);
    expect(stepped).toContain('href="/cn-25"');
    expect(stepped).toContain('href="/cn-11"');
    expect(plain(stepped)).toContain("2 of 3");
  });

  it("prints the proof a close stored as cn's line, and what the command said in full", () => {
    const closed: ShownIssue = {
      ...held,
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
    expect(line).toBe("proof           vp run verify (exit 0) by wsl/claude 1h ago");
    const text = page(closed);
    expect(text).toContain(squeeze(line));
    expect(text).toContain("output Test Files 33 passed Tests 227 passed");
    expect(brief(closed, now)).not.toContain("33 passed");
  });

  it("prints the reason a drop gave as cn's line", () => {
    const dropped: ShownIssue = {
      ...held,
      status: "dropped",
      claimedBy: undefined,
      closedAt: now - HOUR,
      droppedReason: "superseded by cn-30",
    };
    expect(brief(dropped, now)).toContain("reason          superseded by cn-30");
    expect(page(dropped)).toContain("reason superseded by cn-30");
  });

  it("sets the links fact as cn's lines, each link an anchor opening in a new tab", () => {
    const linked: ShownIssue = {
      ...held,
      links: [
        { url: "https://example.com/doc", label: "doc", by: agent, at: now - 2 * HOUR },
        { url: "https://example.com/pr/7", by: agent, at: now - HOUR },
      ],
    };
    const text = brief(linked, now);
    expect(text).toContain(
      `links           doc · https://example.com/doc · by ${agent.name} 2h ago\n                https://example.com/pr/7 · by ${agent.name} 1h ago`,
    );
    const markup = renderToStaticMarkup(<IssuePage issue={linked} siblings={[]} now={now} />);
    const table = markup.slice(markup.indexOf("<dl"), markup.indexOf("</dl>"));
    expect(plain(table)).toBe(factsOf(text));
    const items = table.match(/<li>.*?<\/li>/g) ?? [];
    expect(items.map(plain)).toEqual(linked.links!.map((link) => linkLine(linkParts(link, now))));
    for (const url of ["https://example.com/doc", "https://example.com/pr/7"])
      expect(table).toContain(`href="${url}" target="_blank" rel="noreferrer"`);
  });

  it("prints the description in full, where the brief keeps its first line", () => {
    const described: ShownIssue = {
      ...held,
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

  it("prints the whole journal, newest first, where the brief carries the five newest", () => {
    /** `count` entries, `entry <count>` newest, an hour apart back from an hour ago. */
    const journal = (count: number): ShownIssue["journal"] =>
      Array.from({ length: count }, (_, i) => ({
        author: agent,
        kind: "finding",
        body: `entry ${count - i}`,
        at: now - (i + 1) * HOUR,
      }));

    const text = page(issue({ ...held, journal: journal(JOURNAL_HEAD + 1) }));
    const bodies = ["entry 6", "entry 5", "entry 4", "entry 3", "entry 2", "entry 1"];
    const positions = bodies.map((body) => text.indexOf(body));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(text).not.toContain("cn show carries");

    expect(page(issue({ ...held, journal: journal(JOURNAL_MAX) }))).toContain(
      `The ${JOURNAL_MAX} newest`,
    );
  });
});

describe("a blocker's page", () => {
  const raised = blocker({
    id: "bl-4",
    title: "name the day the page goes live",
    blockerKind: "decision",
    whatResolves: "a date on or after 2026-09-24",
    issues: [{ id: "cn-21", title: "put the page on a public URL" }],
  });

  it("sets cn show's lines for it as its table", () => {
    const markup = renderToStaticMarkup(<BlockerPage blocker={raised} now={now} />);
    const table = markup.slice(markup.indexOf("<dl"), markup.indexOf("</dl>"));
    expect(plain(table)).toBe(factsOf(brief(raised, now)));
    expect(plain(markup)).toContain(ref(raised.issues[0]!));
  });

  it("sets its links as cn's lines, each an anchor, after what it holds", () => {
    const linked = {
      ...raised,
      links: [{ url: "https://example.com/options", label: "options", by: agent, at: now - HOUR }],
    };
    const text = brief(linked, now);
    expect(text).toContain(
      `links           options · https://example.com/options · by ${agent.name} 1h ago`,
    );
    const markup = renderToStaticMarkup(<BlockerPage blocker={linked} now={now} />);
    const table = markup.slice(markup.indexOf("<dl"), markup.indexOf("</dl>"));
    expect(plain(table)).toBe(factsOf(text));
    const items = table.match(/<li>.*?<\/li>/g) ?? [];
    expect(items.map(plain)).toEqual(linked.links.map((link) => linkLine(linkParts(link, now))));
    expect(table).toContain(`href="https://example.com/options" target="_blank" rel="noreferrer"`);
  });

  it("quotes the person's words under the resolve an agent made on them, as cn does", () => {
    const resolved = {
      ...raised,
      status: "resolved" as const,
      resolvedBy: agent,
      resolvedAt: now - HOUR,
      resolution: "done",
      said: "the round trip is done, go ahead",
    };
    const fact = blockerFacts(resolved, now).find((f) => f.label === "on their word");
    expect(fact).toEqual({ label: "on their word", text: '"the round trip is done, go ahead"' });
    const markup = renderToStaticMarkup(<BlockerPage blocker={resolved} now={now} />);
    const table = markup.slice(markup.indexOf("<dl"), markup.indexOf("</dl>"));
    expect(plain(table)).toBe(factsOf(brief(resolved, now)));
    expect(plain(table)).toContain(`${fact!.label} ${fact!.text}`);
  });

  it("offers the ask menu while it is raised, and not once it is resolved", () => {
    const resolved = {
      ...raised,
      status: "resolved" as const,
      resolvedAt: now,
      resolution: "done",
    };
    const ask = 'aria-label="Say to your agent"';
    expect(renderToStaticMarkup(<BlockerPage blocker={raised} now={now} />)).toContain(ask);
    expect(renderToStaticMarkup(<BlockerPage blocker={resolved} now={now} />)).not.toContain(ask);
  });
});

describe("an epic's page", () => {
  it("sets its links as cn's lines, each an anchor, and none where it has none", () => {
    const planned = epic({
      id: "ep-12",
      title: "links on everything",
      links: [{ url: "https://example.com/plan", label: "plan", by: agent, at: now - 2 * HOUR }],
    });
    const line = `plan · https://example.com/plan · by ${agent.name} 2h ago`;
    expect(brief(planned, now)).toContain(`links           ${line}`);
    const markup = renderToStaticMarkup(<EpicPage epic={planned} issues={[]} now={now} />);
    const table = markup.slice(markup.indexOf("<dl"), markup.indexOf("</dl>"));
    expect(plain(table)).toBe(`links ${line}`);
    const items = table.match(/<li>.*?<\/li>/g) ?? [];
    expect(items.map(plain)).toEqual(planned.links!.map((link) => linkLine(linkParts(link, now))));
    expect(table).toContain(`href="https://example.com/plan" target="_blank" rel="noreferrer"`);
    expect(renderToStaticMarkup(<EpicPage epic={epic()} issues={[]} now={now} />)).not.toContain(
      "<dl",
    );
  });
});
