import { describe, expect, it } from "vitest";
import {
  blockerLine,
  brief,
  briefLines,
  closedLines,
  edgeLine,
  epicClosedLines,
  epicDoneLine,
  freedLine,
  healthLines,
  historyLines,
  holdsLine,
  issueLine,
  listLine,
  logLine,
  nearLine,
  placedLine,
  projectLine,
  projectLines,
  reviewLines,
  searchLine,
  staleLines,
  unjournaledLine,
} from "./lines.mts";
import { logParts, unjournaled } from "./parts.mts";
import {
  DAY,
  HOUR,
  MINUTE,
  agent,
  ago,
  blocker,
  briefView,
  epic,
  human,
  issue,
  logEvent,
  now,
  project,
} from "./testing.mts";
import type { BriefView, ReviewView } from "./views.mts";

describe("issueLine", () => {
  it("starts with the reference form and names the epic", () => {
    expect(
      issueLine({
        id: "cn-1",
        title: "schema, ids, revision, events",
        status: "open",
        priority: 0,
        epic: { id: "ep-1", title: "Create to close" },
      }),
    ).toBe('cn-1 "schema, ids, revision, events" P0 open  ep-1 "Create to close"');
  });

  it("names who holds it when it is claimed", () => {
    expect(
      issueLine({
        id: "cn-2",
        title: "the lifecycle",
        status: "in_progress",
        priority: 1,
        epic: { id: "ep-1", title: "Create to close" },
        claimedBy: { name: "wsl/claude" },
      }),
    ).toBe('cn-2 "the lifecycle" P1 in_progress  ep-1 "Create to close" · wsl/claude');
  });
});

describe("healthLines", () => {
  const bare = {
    id: "ep-3",
    title: "An epic tells the truth",
    lastActivity: now - DAY,
    counts: { open: 0, inProgress: 0, closed: 2, followUps: 1 },
    health: { moving: [], stuck: [], waiting: [] },
  };

  it("is one line for an epic with nothing behind the other three", () => {
    expect(healthLines(bare, now)).toEqual([
      'ep-3 "An epic tells the truth"  2 done · 0 open · 1 follow-up',
    ]);
  });

  it("pluralises the follow-ups", () => {
    expect(
      healthLines({ ...bare, counts: { open: 1, inProgress: 1, closed: 2, followUps: 2 } }, now)[0],
    ).toBe('ep-3 "An epic tells the truth"  2 done · 2 open · 2 follow-ups');
  });

  it("names what is moving, what is stuck and what waits on a person", () => {
    expect(
      healthLines(
        {
          ...bare,
          health: {
            moving: [
              {
                id: "cn-7",
                title: "the web window's first page",
                claimedBy: { name: "wsl/claude" },
                claimedAt: ago(2 * HOUR),
              },
            ],
            stuck: [{ id: "cn-9", title: "the page's live feed", lastActivity: ago(9 * DAY) }],
            waiting: [{ id: "bl-3", title: "confirm the invite copy", owner: "balder" }],
          },
        },
        now,
      ).slice(1),
    ).toEqual([
      '  moving   cn-7 "the web window\'s first page" wsl/claude 2h',
      '  stuck    cn-9 "the page\'s live feed" silent 9d',
      '  waiting  bl-3 "confirm the invite copy" · owner balder',
    ]);
  });

  /** Stuck issues as the deployment orders them, most urgent first. */
  const stuck = (n: number) =>
    [9, 4, 8, 6, 5].slice(0, n).map((days, i) => ({
      id: `cn-${i + 1}`,
      title: `stuck ${i + 1}`,
      lastActivity: ago(days * DAY),
    }));
  const waiting = [{ id: "bl-3", title: "confirm the invite copy", owner: "balder" }];

  it("names the first three stuck issues in the order given and counts the rest", () => {
    expect(
      healthLines({ ...bare, health: { moving: [], stuck: stuck(5), waiting } }, now).slice(1),
    ).toEqual([
      '  stuck    cn-1 "stuck 1" silent 9d',
      '  stuck    cn-2 "stuck 2" silent 4d',
      '  stuck    cn-3 "stuck 3" silent 8d',
      "           and 2 more stuck",
      '  waiting  bl-3 "confirm the invite copy" · owner balder',
    ]);
  });

  it("prints no count when exactly three are stuck", () => {
    expect(
      healthLines({ ...bare, health: { moving: [], stuck: stuck(3), waiting: [] } }, now).slice(1),
    ).toEqual([
      '  stuck    cn-1 "stuck 1" silent 9d',
      '  stuck    cn-2 "stuck 2" silent 4d',
      '  stuck    cn-3 "stuck 3" silent 8d',
    ]);
  });
});

describe("projectLines", () => {
  it("is the head alone for a project nothing is filed under", () => {
    expect(projectLines(project(), now)).toEqual(['app "the app"  nothing filed']);
  });

  it("prints the block an epic with the same counts and health prints", () => {
    const counts = { open: 2, inProgress: 1, closed: 3, dropped: 0, followUps: 1 };
    const health = {
      moving: [
        {
          id: "app-4",
          title: "the invite flow",
          claimedBy: agent,
          claimedAt: ago(2 * HOUR),
        },
      ],
      stuck: [{ id: "app-2", title: "the settings page", lastActivity: ago(9 * DAY) }],
      waiting: [{ id: "bl-3", title: "confirm the invite copy", owner: "balder" }],
    };
    const lines = projectLines(project({ filed: 7, counts, health }), now);
    expect(lines).toEqual(healthLines({ id: "app", title: "the app", counts, health }, now));
    expect(lines).toEqual([
      'app "the app"  3 done · 3 open · 1 follow-up',
      '  moving   app-4 "the invite flow" wsl/claude 2h',
      '  stuck    app-2 "the settings page" silent 9d',
      '  waiting  bl-3 "confirm the invite copy" · owner balder',
    ]);
  });

  it("is the head with its counts and no rows when nothing filed is live", () => {
    const counts = { open: 0, inProgress: 0, closed: 2, dropped: 1, followUps: 0 };
    expect(projectLines(project({ filed: 3, counts }), now)).toEqual([
      'app "the app"  2 done · 0 open · 0 follow-ups',
    ]);
  });
});

describe("reviewLines", () => {
  const reviewed = {
    id: "ep-1",
    title: "Create to close",
    revision: 0,
    counts: { open: 2, inProgress: 1, closed: 1, dropped: 0, followUps: 1 },
  };
  const quiet = {
    epic: reviewed,
    canClose: false,
    near: [],
    inbox: [],
    nudges: [],
    silent: [],
    unverified: [],
    edges: [],
  };
  const review = (over: Record<string, unknown>): ReviewView => ({ ...quiet, ...over }) as never;

  it("prints every finding under the epic, one line each, in the order the verb lists them", () => {
    const view = review({
      near: [
        {
          a: { id: "cn-3", title: "fix connection retry" },
          b: { id: "cn-4", title: "Fix connection retry." },
        },
      ],
      inbox: [{ id: "cn-7", title: "the retry path", createdAt: ago(8 * DAY) }],
      nudges: [
        {
          id: "bl-1",
          title: "App Store review",
          owner: "balder",
          nudgeAt: Date.UTC(2026, 8, 3),
          holds: [{ id: "cn-1", title: "the lifecycle" }],
        },
      ],
      silent: [
        {
          id: "cn-2",
          title: "the graph",
          claimedBy: { name: "wsl/claude", kind: "agent" },
          lastActivity: ago(8 * DAY),
        },
      ],
      unverified: [
        { id: "cn-5", title: "the brief", closedAt: ago(8 * DAY), reason: "no device here" },
      ],
      edges: [
        {
          from: { id: "cn-5", title: "the brief", status: "closed" },
          to: { id: "cn-1", title: "the lifecycle", status: "open" },
        },
      ],
      canClose: true,
    });
    expect(reviewLines(view, now)).toEqual([
      'ep-1 "Create to close"  1 done · 3 open · 1 follow-up',
      '  near        cn-3 "fix connection retry" and cn-4 "Fix connection retry."',
      '  inbox       cn-7 "the retry path" 8d',
      '  nudge       bl-1 "App Store review" · owner balder · nudge 2026-09-03 · holds cn-1 "the lifecycle"',
      '  silent      cn-2 "the graph" wsl/claude · silent 8d',
      '  unverified  cn-5 "the brief" closed 8d ago · no follow-up · no device here',
      '  edge        cn-5 "the brief" done blocks cn-1 "the lifecycle"',
      "  can close   cn epic close ep-1 --revision 0",
    ]);
  });

  it("marks each finished end of an edge, dropped as well as done", () => {
    const view = review({
      edges: [
        {
          from: { id: "cn-5", title: "the brief", status: "open" },
          to: { id: "cn-1", title: "the lifecycle", status: "dropped" },
        },
      ],
    });
    expect(reviewLines(view, now)[1]).toBe(
      '  edge        cn-5 "the brief" blocks cn-1 "the lifecycle" dropped',
    );
  });

  it("says there is nothing to look at when there is nothing", () => {
    expect(reviewLines(review({}), now)).toEqual([
      'ep-1 "Create to close"  1 done · 3 open · 1 follow-up',
      "  nothing to look at",
    ]);
  });

  it("prints the can close row alone when that is the one finding", () => {
    const done = {
      ...reviewed,
      revision: 4,
      counts: { open: 0, inProgress: 0, closed: 4, dropped: 0, followUps: 0 },
    };
    expect(reviewLines(review({ canClose: true, epic: done }), now)).toEqual([
      'ep-1 "Create to close"  4 done · 0 open · 0 follow-ups',
      "  can close   cn epic close ep-1 --revision 4",
    ]);
  });
});

describe("epicDoneLine", () => {
  it("offers the epic close under a close, at the follow-up line's width", () => {
    expect(epicDoneLine({ id: "ep-1", title: "Create to close", revision: 2 })).toBe(
      '  epic       ep-1 "Create to close" can close · cn epic close ep-1 --revision 2',
    );
  });
});

describe("nearLine", () => {
  it("names the near-identical title under a create", () => {
    expect(nearLine({ id: "cn-1", title: "fix connection retry" })).toBe(
      '  near       cn-1 "fix connection retry"',
    );
  });
});

describe("placedLine", () => {
  it("says the issue went beside its parent rather than into the inbox", () => {
    expect(placedLine({ id: "cn-1", title: "the lifecycle" })).toBe(
      '  placed     beside its parent cn-1 "the lifecycle", not in the inbox',
    );
  });
});

describe("closedLines", () => {
  const closed = {
    id: "cn-6",
    title: "the same title",
    status: "closed",
    priority: 2,
    epic: { id: "ep-2", title: "scratch: review" },
    revision: 3,
  };

  it("is the issue line alone when the close made nothing else", () => {
    expect(closedLines({ issue: closed, madeReady: [] })).toEqual([
      'cn-6 "the same title" P2 closed  ep-2 "scratch: review" r3',
    ]);
  });

  it("prints the follow-up the same mutation made under it, and the epic's offer last", () => {
    expect(
      closedLines({
        issue: closed,
        followUp: {
          id: "cn-8",
          title: "verify: the same title",
          status: "open",
          priority: 2,
          epic: closed.epic,
          revision: 0,
        },
        epicDone: { id: "ep-2", title: "scratch: review", revision: 0 },
        madeReady: [],
      }),
    ).toEqual([
      'cn-6 "the same title" P2 closed  ep-2 "scratch: review" r3',
      '  follow-up  cn-8 "verify: the same title" P2 open  ep-2 "scratch: review" r0',
      '  epic       ep-2 "scratch: review" can close · cn epic close ep-2 --revision 0',
    ]);
  });

  it("prints each issue the close was the last thing holding as a ready line, between the follow-up and the offer", () => {
    const open = { status: "open", priority: 2, epic: closed.epic, revision: 0 };
    expect(
      closedLines({
        issue: closed,
        followUp: { ...open, id: "cn-8", title: "verify: the same title" },
        madeReady: [
          { ...open, id: "cn-9", title: "confirm on a device" },
          { ...open, id: "cn-10", title: "the page", priority: 3 },
        ],
        epicDone: { id: "ep-2", title: "scratch: review", revision: 0 },
      }),
    ).toEqual([
      'cn-6 "the same title" P2 closed  ep-2 "scratch: review" r3',
      '  follow-up  cn-8 "verify: the same title" P2 open  ep-2 "scratch: review" r0',
      '  ready      cn-9 "confirm on a device" P2 open  ep-2 "scratch: review" r0',
      '  ready      cn-10 "the page" P3 open  ep-2 "scratch: review" r0',
      '  epic       ep-2 "scratch: review" can close · cn epic close ep-2 --revision 0',
    ]);
  });
});

describe("epicClosedLines", () => {
  const told = { id: "ep-3", title: "An epic tells the truth", revision: 2 };
  const closed = (followUps: number) => ({
    epic: { ...told, status: "closed", counts: { followUps } },
    dropped: [],
  });

  it("takes the word from the status the deployment answered, not from a flag", () => {
    expect(epicClosedLines(closed(0))).toEqual(['ep-3 "An epic tells the truth" closed r2']);
  });

  it("counts the follow-ups a close left open, one or more", () => {
    expect(epicClosedLines(closed(1))).toEqual([
      'ep-3 "An epic tells the truth" closed r2',
      "  1 follow-up still open",
    ]);
    expect(epicClosedLines(closed(2))).toEqual([
      'ep-3 "An epic tells the truth" closed r2',
      "  2 follow-ups still open",
    ]);
  });

  it("lists each issue a drop took with the epic, at the answer column", () => {
    expect(
      epicClosedLines({
        epic: { ...told, status: "dropped", counts: { followUps: 0 } },
        dropped: [
          { id: "cn-4", title: "a" },
          { id: "cn-7", title: "b" },
        ],
      }),
    ).toEqual([
      'ep-3 "An epic tells the truth" dropped r2',
      '  dropped    cn-4 "a"',
      '  dropped    cn-7 "b"',
    ]);
  });
});

describe("projectLine", () => {
  it("is the slug, then the name", () => {
    expect(projectLine({ slug: "cn", name: "cairn: backend, cli, plugin" })).toBe(
      "cn  cairn: backend, cli, plugin",
    );
  });
});

describe("blockerLine", () => {
  const raised = {
    id: "bl-1",
    title: "the App Store agreement",
    blockerKind: "approval",
    owner: "balder",
    status: "raised",
    raisedAt: ago(5 * MINUTE),
    raisedBy: { name: "wsl/claude" },
  };

  it("names the owner before anything else, and who raised it", () => {
    expect(blockerLine(raised, now)).toBe(
      'bl-1 "the App Store agreement" approval · owner balder · raised 5m ago by wsl/claude',
    );
  });

  it("says acknowledged where the tense does not already say it", () => {
    expect(blockerLine({ ...raised, status: "waiting" }, now)).toBe(
      'bl-1 "the App Store agreement" approval · owner balder · waiting · raised 5m ago by wsl/claude',
    );
  });

  it("ends on whoever resolved it once it is resolved", () => {
    expect(
      blockerLine(
        {
          ...raised,
          status: "resolved",
          resolvedAt: ago(2 * HOUR),
          resolvedBy: { name: "wsl/balder" },
        },
        now,
      ),
    ).toBe(
      'bl-1 "the App Store agreement" approval · owner balder · resolved 2h ago by wsl/balder',
    );
  });
});

describe("listLine", () => {
  const row = {
    id: "cn-4",
    title: "confirm the retry path on a device",
    status: "open",
    priority: 1,
    epic: { id: "ep-1", title: "Create to close" },
  };
  const holder = [{ id: "cn-1", title: "schema, ids" }];

  it("is the issue line when the list was asked neither question", () => {
    expect(listLine(row, now)).toBe(issueLine(row));
  });

  it("ends on how long nobody has touched it", () => {
    expect(listLine({ ...row, silentSince: ago(4 * DAY) }, now)).toBe(
      `${issueLine(row)} · silent 4d`,
    );
  });

  it("ends on what holds it, in the reference form", () => {
    expect(listLine({ ...row, blockedBy: holder }, now)).toBe(
      `${issueLine(row)} · blocked by cn-1 "schema, ids"`,
    );
  });

  it("puts the silence before what holds it when both were asked", () => {
    expect(listLine({ ...row, silentSince: ago(4 * DAY), blockedBy: holder }, now)).toBe(
      `${issueLine(row)} · silent 4d · blocked by cn-1 "schema, ids"`,
    );
  });
});

describe("searchLine", () => {
  const row = {
    id: "cn-4",
    title: "confirm the retry path on a device",
    status: "open",
    priority: 1,
    epic: { id: "ep-1", title: "Create to close" },
  };

  it("is the issue line, marked with the field that held the text", () => {
    expect(searchLine({ ...row, matched: "journal" })).toBe(`${issueLine(row)} · in journal`);
  });
});

describe("edgeLine", () => {
  const from = { id: "cn-1", title: "schema, ids" };
  const to = { id: "cn-2", title: "the lifecycle" };

  it("reads a blocks row from the end that is held up", () => {
    expect(edgeLine({ type: "blocks", from, to })).toBe(
      'cn-2 "the lifecycle" blocked by cn-1 "schema, ids"',
    );
  });

  it("reads every other type from the issue that was named", () => {
    expect(edgeLine({ type: "related", from, to })).toBe(
      'cn-1 "schema, ids" related to cn-2 "the lifecycle"',
    );
    expect(edgeLine({ type: "discovered-from", from, to })).toBe(
      'cn-1 "schema, ids" discovered from cn-2 "the lifecycle"',
    );
    expect(edgeLine({ type: "duplicates", from, to })).toBe(
      'cn-1 "schema, ids" duplicates cn-2 "the lifecycle"',
    );
    expect(edgeLine({ type: "supersedes", from, to })).toBe(
      'cn-1 "schema, ids" supersedes cn-2 "the lifecycle"',
    );
  });
});

describe("brief", () => {
  it("opens with the reference form and leaves out what is empty", () => {
    const lines = brief(issue(), now).split("\n");
    expect(lines[0]).toBe('cn-1 "schema, ids, revision, events"');
    expect(lines[1]).toBe('epic            ep-1 "Create to close"');
    expect(lines[3]).toBe("status          open · P0 · created 2h ago · revision 0");
    expect(brief(issue(), now)).not.toMatch(/blocks|waiting on|journal|acceptance/);
  });

  it("prints each link on its own line under the label, the label before the URL where there is one", () => {
    const links = [
      { url: "https://example.com/doc", label: "doc", by: agent, at: ago(2 * HOUR) },
      { url: "https://example.com/pr/7", by: agent, at: now },
    ];
    const lines = brief(issue({ links }), now).split("\n");
    const at = lines.findIndex((line) => line.startsWith("links"));
    expect(lines.slice(at, at + 2)).toEqual([
      `links           doc · https://example.com/doc · by ${agent.name} 2h ago`,
      `                https://example.com/pr/7 · by ${agent.name} just now`,
    ]);
  });

  it("says created just now, not created just now ago", () => {
    const fresh = issue({ createdAt: now - 1_000 });
    expect(brief(fresh, now)).toContain("created just now · revision 0");
  });

  it("marks a design that continues past its first line", () => {
    expect(brief(issue(), now)).toMatch(/design {10}transcribe §3…/);
  });

  it("prints the neighbourhood and the journal when there is any", () => {
    const shown = issue({
      status: "in_progress",
      claimedBy: { name: "wsl/claude", kind: "agent" },
      claimedAt: ago(5 * MINUTE),
      waitingOn: [{ id: "bl-1", title: "the App Store agreement" }],
      followUps: [{ id: "cn-2", title: "check it on a device", status: "open" }],
      journal: [
        {
          author: { name: "wsl/claude", kind: "agent" },
          kind: "finding",
          body: "the counter row is created on first use",
          at: ago(HOUR),
        },
      ],
    });
    const text = brief(shown, now);
    expect(text).toContain(
      "status          moving wsl/claude 5m · P0 · created 2h ago · revision 0",
    );
    expect(text).not.toContain("claimed");
    expect(text).not.toContain("requires");
    expect(text).toContain('waiting on      bl-1 "the App Store agreement"');
    expect(text).toContain("  1h wsl/claude finding: the counter row is created on first use");
  });

  it("opens the status line with the state word alone where the things it names have their own line", () => {
    const waiting = issue({
      waitingOn: [{ id: "bl-1", title: "the App Store agreement" }],
    });
    expect(brief(waiting, now).split("\n").slice(3, 5)).toEqual([
      "status          waiting · P0 · created 2h ago · revision 0",
      'waiting on      bl-1 "the App Store agreement"',
    ]);
    const blocked = issue({
      blockedBy: [{ id: "cn-2", title: "the lifecycle", status: "open" }],
    });
    expect(brief(blocked, now).split("\n").slice(3, 5)).toEqual([
      "status          blocked · P0 · created 2h ago · revision 0",
      'blocked by      cn-2 "the lifecycle"',
    ]);
  });

  it("prints the description's first line before the design's", () => {
    const shown = issue({
      description: "Balder, 2026-09-21: the journal is the most context an issue has.\n\nMore.",
    });
    expect(brief(shown, now).split("\n").slice(4, 6)).toEqual([
      "description     Balder, 2026-09-21: the journal is the most context an issue has.…",
      "design          transcribe §3…",
    ]);
  });

  it("prints the proof a close stored, and the reason a drop gave", () => {
    const closed = issue({
      status: "closed",
      closedAt: ago(HOUR),
      revision: 4,
      verification: {
        command: "vp run verify",
        exitCode: 0,
        output: "Test Files  33 passed",
        at: ago(HOUR),
        by: { name: "wsl/claude", kind: "agent" },
      },
    });
    expect(brief(closed, now).split("\n").slice(3, 5)).toEqual([
      "status          closed 1h ago · P0 · created 2h ago · revision 4",
      "proof           vp run verify (exit 0) by wsl/claude 1h ago",
    ]);
    expect(brief(closed, now)).not.toContain("33 passed");
    const unverified = issue({
      ...closed,
      verification: {
        unverified: "ran on the device, see the evidence entry",
        at: ago(HOUR),
        by: { name: "wsl/claude", kind: "agent" },
      },
    });
    expect(brief(unverified, now)).toContain(
      "proof           unverified by wsl/claude 1h ago: ran on the device, see the evidence entry",
    );
    const dropped = issue({
      status: "dropped",
      closedAt: ago(2 * HOUR),
      droppedReason: "not going to happen",
    });
    expect(brief(dropped, now).split("\n").slice(3, 5)).toEqual([
      "status          dropped 2h ago · P0 · created 2h ago · revision 0",
      "reason          not going to happen",
    ]);
  });

  it("marks a blocking edge whose far end is finished as done, and it does not block", () => {
    const shown = issue({
      blocks: [{ id: "cn-3", title: "the graph", status: "dropped" }],
      blockedBy: [
        { id: "cn-2", title: "the lifecycle", status: "closed" },
        { id: "cn-4", title: "the brief", status: "in_progress" },
      ],
    });
    const lines = brief(shown, now).split("\n");
    expect(lines.slice(3, 6)).toEqual([
      "status          blocked · P0 · created 2h ago · revision 0",
      'blocks          cn-3 "the graph" dropped',
      'blocked by      cn-2 "the lifecycle" done, cn-4 "the brief"',
    ]);
    const done = issue({
      ...shown,
      blockedBy: [{ id: "cn-2", title: "the lifecycle", status: "closed" }],
    });
    expect(brief(done, now).split("\n")[3]).toBe(
      "status          open · P0 · created 2h ago · revision 0",
    );
  });

  it("marks every finished issue the brief names, a dropped follow-up and a closed parent among them", () => {
    const shown = issue({
      parent: { id: "cn-1", title: "the web window", status: "closed" },
      followUps: [
        { id: "cn-5", title: "verify: on a device", status: "dropped" },
        { id: "cn-6", title: "verify: in a browser", status: "closed" },
        { id: "cn-7", title: "verify: on a phone", status: "open" },
      ],
      related: [
        { id: "cn-8", title: "the brief", status: "closed" },
        { id: "cn-9", title: "the feed", status: "open" },
      ],
      discoveredFrom: [
        { id: "cn-10", title: "the lifecycle", status: "dropped" },
        { id: "cn-11", title: "the graph", status: "in_progress" },
      ],
      duplicates: [
        { id: "cn-12", title: "a duplicate", status: "closed" },
        { id: "cn-13", title: "another", status: "open" },
      ],
      supersedes: [
        { id: "cn-14", title: "the old plan", status: "dropped" },
        { id: "cn-15", title: "the older plan", status: "open" },
      ],
    });
    const lines = brief(shown, now).split("\n");
    expect(lines.slice(4, 10)).toEqual([
      'parent          cn-1 "the web window" done',
      'follow-ups      cn-5 "verify: on a device" dropped, cn-6 "verify: in a browser" done, cn-7 "verify: on a phone"',
      'related         cn-8 "the brief" done, cn-9 "the feed"',
      'discovered from cn-10 "the lifecycle" dropped, cn-11 "the graph"',
      'duplicates      cn-12 "a duplicate" done, cn-13 "another"',
      'supersedes      cn-14 "the old plan" dropped, cn-15 "the older plan"',
    ]);
  });

  it("prints each edge type on its own line, blocking ones first", () => {
    const shown = issue({
      blocks: [{ id: "cn-3", title: "the graph", status: "open" }],
      blockedBy: [{ id: "cn-2", title: "the lifecycle", status: "open" }],
      related: [{ id: "cn-4", title: "the brief", status: "open" }],
      discoveredFrom: [{ id: "cn-2", title: "the lifecycle", status: "open" }],
      duplicates: [{ id: "cn-5", title: "a duplicate", status: "open" }],
      supersedes: [{ id: "cn-6", title: "the old plan", status: "open" }],
    });
    const lines = brief(shown, now).split("\n");
    expect(lines.slice(4, 10)).toEqual([
      'blocks          cn-3 "the graph"',
      'blocked by      cn-2 "the lifecycle"',
      'related         cn-4 "the brief"',
      'discovered from cn-2 "the lifecycle"',
      'duplicates      cn-5 "a duplicate"',
      'supersedes      cn-6 "the old plan"',
    ]);
  });

  it("prints the history after the journal, when it was asked for", () => {
    const shown = issue({ events: [changed] });
    const lines = brief(shown, now).split("\n");
    expect(lines.at(-2)).toBe("history");
    expect(lines.at(-1)).toBe(
      "  r4  wsl/claude  2h ago  issue.update  priority 2 → 1, epic ep-1 → ep-2",
    );
  });

  it("prints an epic as its line, its description and its open issues", () => {
    const shown = epic({
      description: "an agent creates, claims, journals and closes work",
      counts: { open: 1, inProgress: 0, closed: 0, dropped: 0, followUps: 0 },
      health: {
        moving: [],
        stuck: [],
        waiting: [{ id: "bl-3", title: "confirm the invite copy", owner: "balder" }],
      },
      issues: [{ id: "cn-1", title: "schema, ids", status: "open", priority: 0 }],
    });
    expect(brief(shown, now).split("\n")).toEqual([
      'ep-1 "Create to close"  0 done · 1 open · 0 follow-ups · revision 0',
      '  waiting  bl-3 "confirm the invite copy" · owner balder',
      "an agent creates, claims, journals and closes work",
      '  cn-1 "schema, ids" P0 open',
    ]);
  });

  it("prints an epic's links under its head, before its description", () => {
    const shown = epic({
      description: "the plan",
      revision: 3,
      links: [{ url: "https://example.com/plan", label: "plan", by: agent, at: ago(2 * HOUR) }],
    });
    expect(brief(shown, now).split("\n")).toEqual([
      'ep-1 "Create to close"  0 done · 0 open · 0 follow-ups · revision 3',
      `links           plan · https://example.com/plan · by ${agent.name} 2h ago`,
      "the plan",
    ]);
  });

  it("prints a blocker's links after what it holds", () => {
    const shown = blocker({
      issues: [{ id: "cn-1", title: "schema, ids", status: "open" }],
      links: [{ url: "https://example.com/options", by: agent, at: now }],
    });
    expect(brief(shown, now).split("\n").slice(-2)).toEqual([
      'holds           cn-1 "schema, ids"',
      `links           https://example.com/options · by ${agent.name} just now`,
    ]);
  });

  it("marks a finished issue a blocker holds as done, and a live one with no word", () => {
    const shown = blocker({
      issues: [
        { id: "cn-1", title: "schema, ids", status: "closed" },
        { id: "cn-2", title: "the lifecycle", status: "open" },
      ],
    });
    expect(brief(shown, now).split("\n").at(-1)).toBe(
      'holds           cn-1 "schema, ids" done, cn-2 "the lifecycle"',
    );
  });

  it("prints a blocker as who must act, what would end it and what it holds", () => {
    const shown = blocker({
      nudgeAt: Date.UTC(2026, 9, 1),
      issues: [{ id: "cn-1", title: "schema, ids", status: "open" }],
    });
    expect(brief(shown, now).split("\n")).toEqual([
      'bl-1 "the App Store agreement"',
      "kind            approval · owner balder",
      "status          raised 2h ago by wsl/claude · revision 0",
      "resolves when   accept it in App Store Connect",
      "nudge           2026-10-01",
      'holds           cn-1 "schema, ids"',
    ]);
  });

  it("prints who ended a resolved blocker, and its history when it was asked for", () => {
    const shown = blocker({
      status: "resolved",
      raisedAt: ago(DAY),
      resolvedBy: human,
      resolvedAt: ago(HOUR),
      resolution: "accepted",
      revision: 1,
      events: [changed],
    });
    const lines = brief(shown, now).split("\n");
    expect(lines).toContain("status          resolved · raised 1d ago by wsl/claude · revision 1");
    expect(lines).toContain("resolved        by wsl/balder 1h ago: accepted");
    expect(lines.at(-2)).toBe("history");
  });

  it("quotes the person's words under the resolve an agent made on them", () => {
    const shown = blocker({
      status: "resolved",
      resolvedBy: agent,
      resolvedAt: ago(HOUR),
      resolution: "done",
      said: "the round trip is done, go ahead",
      revision: 1,
    });
    const lines = brief(shown, now).split("\n");
    const at = lines.indexOf("resolved        by wsl/claude 1h ago: done");
    expect(at).toBeGreaterThan(0);
    expect(lines[at + 1]).toBe('on their word   "the round trip is done, go ahead"');
  });
});

describe("issueLine with a revision", () => {
  it("ends with the number the next write has to send", () => {
    expect(
      issueLine({
        id: "cn-2",
        title: "the lifecycle",
        status: "in_progress",
        priority: 0,
        epic: { id: "ep-1", title: "Create to close" },
        claimedBy: { name: "wsl/claude" },
        revision: 3,
      }),
    ).toBe('cn-2 "the lifecycle" P0 in_progress  ep-1 "Create to close" · wsl/claude r3');
  });
});

const changed = {
  revision: 4,
  actor: agent,
  at: ago(2 * HOUR),
  kind: "issue.update",
  changes: { priority: { from: 2, to: 1 }, epic: { from: "ep-1", to: "ep-2" } },
};

describe("staleLines", () => {
  it("is one line per change since the revision the caller read", () => {
    expect(staleLines({ since: [changed] }, now)).toEqual([
      "  r4  wsl/claude  2h ago  issue.update  priority 2 → 1, epic ep-1 → ep-2",
    ]);
  });

  it("is nothing when the error carried no history", () => {
    expect(staleLines({}, now)).toEqual([]);
  });

  it("reads an append as its kind and first line, with no revision, never as JSON", () => {
    expect(
      staleLines(
        {
          since: [
            {
              actor: { name: "mac/claude" },
              at: ago(5 * MINUTE),
              kind: "journal.append",
              changes: { kind: "finding", body: "the counter row is created on first use" },
            },
          ],
        },
        now,
      ),
    ).toEqual([
      "  —  mac/claude  5m ago  journal.append  finding: the counter row is created on first use",
    ]);
  });

  it("reads an edge among the changes since from the end the write named", () => {
    const added = {
      actor: { name: "wsl/claude" },
      at: ago(HOUR),
      kind: "edge.add",
      changes: { type: "blocks", from: "cn-1", to: "cn-2" },
    };
    expect(staleLines({ id: "cn-2", since: [added] }, now)).toEqual([
      "  —  wsl/claude  1h ago  edge.add  blocked by cn-1",
    ]);
    expect(staleLines({ id: "cn-1", since: [added] }, now)).toEqual([
      "  —  wsl/claude  1h ago  edge.add  blocks cn-2",
    ]);
  });

  it("reads a field that had no value as coming from nothing", () => {
    expect(
      staleLines(
        {
          since: [
            {
              revision: 1,
              actor: { name: "wsl/claude" },
              at: now,
              kind: "issue.claim",
              // Convex stores no undefined, so a first write comes back as `{ to }` alone.
              changes: {
                status: { from: "open", to: "in_progress" },
                claimedBy: { to: "wsl/claude" },
              },
            },
          ],
        },
        now,
      ),
    ).toEqual([
      "  r1  wsl/claude  just now  issue.claim  status open → in_progress, claimedBy — → wsl/claude",
    ]);
  });

  it("cuts a change too long to read on one line", () => {
    const [line] = staleLines(
      {
        since: [
          {
            revision: 2,
            actor: { name: "wsl/claude" },
            at: now,
            kind: "issue.update",
            changes: { title: { from: "a".repeat(60), to: "b".repeat(60) } },
          },
        ],
      },
      now,
    );
    expect(line).toMatch(/…$/);
    expect(line).toHaveLength("  r2  wsl/claude  just now  issue.update  ".length + 80);
  });
});

describe("historyLines", () => {
  it("is the same shape, for cn show --history", () => {
    expect(historyLines([changed], now)).toEqual(staleLines({ since: [changed] }, now));
  });

  it("reads an edge from whichever end's history it is, and whole when it is nobody's", () => {
    const added = {
      actor: { name: "wsl/claude" },
      at: ago(HOUR),
      kind: "edge.add",
      changes: { type: "blocks", from: "cn-1", to: "cn-2" },
    };
    expect(historyLines([added], now, "cn-1")).toEqual([
      "  —  wsl/claude  1h ago  edge.add  blocks cn-2",
    ]);
    expect(historyLines([added], now, "cn-2")).toEqual([
      "  —  wsl/claude  1h ago  edge.add  blocked by cn-1",
    ]);
    expect(historyLines([added], now)).toEqual([
      "  —  wsl/claude  1h ago  edge.add  cn-2 blocked by cn-1",
    ]);
    // `related` reads the same from either end; a directed type from its far end reads whole.
    const related = { ...added, changes: { type: "related", from: "cn-1", to: "cn-2" } };
    expect(historyLines([related], now, "cn-2")).toEqual([
      "  —  wsl/claude  1h ago  edge.add  related to cn-1",
    ]);
    const found = {
      ...added,
      kind: "edge.remove",
      changes: { type: "discovered-from", from: "cn-3", to: "cn-1" },
    };
    expect(historyLines([found], now, "cn-3")).toEqual([
      "  —  wsl/claude  1h ago  edge.remove  discovered from cn-1",
    ]);
    expect(historyLines([found], now, "cn-1")).toEqual([
      "  —  wsl/claude  1h ago  edge.remove  cn-3 discovered from cn-1",
    ]);
  });

  it("reads a blocker's raise and attach from whichever end's history it is, and whole when it is nobody's", () => {
    const raised = {
      actor: { name: "wsl/claude" },
      at: ago(HOUR),
      kind: "blocker.raise",
      changes: {
        id: "bl-3",
        blockerKind: "decision",
        owner: "balder",
        title: "same title?",
        whatResolves: "drop one",
        issue: "cn-17",
      },
    };
    expect(historyLines([raised], now, "cn-17")).toEqual([
      '  —  wsl/claude  1h ago  blocker.raise  bl-3 "same title?" decision · owner balder',
    ]);
    expect(historyLines([raised], now, "bl-3")).toEqual([
      "  —  wsl/claude  1h ago  blocker.raise  decision · owner balder · holds cn-17",
    ]);
    expect(historyLines([raised], now)).toEqual([
      '  —  wsl/claude  1h ago  blocker.raise  bl-3 "same title?" decision · owner balder · holds cn-17',
    ]);
    const attached = {
      ...raised,
      kind: "blocker.attach",
      changes: { blocker: "bl-3", issue: "cn-18" },
    };
    expect(historyLines([attached], now, "cn-18")).toEqual([
      "  —  wsl/claude  1h ago  blocker.attach  waits on bl-3",
    ]);
    expect(historyLines([attached], now, "bl-3")).toEqual([
      "  —  wsl/claude  1h ago  blocker.attach  holds cn-18",
    ]);
    expect(historyLines([attached], now)).toEqual([
      "  —  wsl/claude  1h ago  blocker.attach  cn-18 waits on bl-3",
    ]);
  });

  it("reads a lifecycle event's explicit changes whole, not the raw patch", () => {
    const claim = {
      revision: 1,
      actor: { name: "balder/claude" },
      at: ago(2 * HOUR),
      kind: "issue.claim",
      changes: { status: { from: "open", to: "in_progress" }, claimedBy: { to: "balder/claude" } },
    };
    const release = {
      revision: 2,
      actor: { name: "balder/claude" },
      at: ago(2 * HOUR),
      kind: "issue.release",
      changes: {
        status: { from: "in_progress", to: "open" },
        claimedBy: { from: "balder/claude" },
      },
    };
    const close = {
      revision: 3,
      actor: { name: "balder/claude" },
      at: ago(2 * HOUR),
      kind: "issue.close",
      changes: {
        status: { from: "in_progress", to: "closed" },
        verification: { to: "vp run verify (exit 0)" },
      },
    };
    const drop = {
      revision: 4,
      actor: { name: "balder/claude" },
      at: ago(2 * HOUR),
      kind: "issue.drop",
      changes: {
        status: { from: "open", to: "dropped" },
        droppedReason: { to: "not going to happen" },
      },
    };
    const lines = historyLines([claim, release, close, drop], now);
    expect(
      lines[0]!.endsWith("issue.claim  status open → in_progress, claimedBy — → balder/claude"),
    ).toBe(true);
    expect(
      lines[1]!.endsWith("issue.release  status in_progress → open, claimedBy balder/claude → —"),
    ).toBe(true);
    expect(
      lines[2]!.endsWith(
        "issue.close  status in_progress → closed, verification — → vp run verify (exit 0)",
      ),
    ).toBe(true);
    expect(
      lines[3]!.endsWith(
        "issue.drop  status open → dropped, droppedReason — → not going to happen",
      ),
    ).toBe(true);
    for (const line of lines) expect(line).not.toContain("…");
  });

  // The shapes are the worklist's own, cn-24's claim and close, cn-1's close and cn-15's drop
  // from before 2026-09-20: the patch as written, keys in the order Convex keeps them.
  it("reads a raw patch from before 2026-09-20 as the line the same move prints today", () => {
    const at = ago(2 * HOUR);
    const event = (revision: number, kind: string, changes: unknown) => ({
      revision,
      actor: agent,
      at,
      kind,
      changes,
    });
    const claim = event(1, "issue.claim", {
      claimedAt: { to: at },
      claimedBy: { to: agent },
      lastActivity: { from: ago(3 * HOUR), to: at },
      status: { from: "open", to: "in_progress" },
    });
    const release = event(2, "issue.release", {
      claimedAt: { from: at },
      claimedBy: { from: agent },
      lastActivity: { from: at, to: at },
      status: { from: "in_progress", to: "open" },
    });
    const close = event(3, "issue.close", {
      claimedAt: { from: at },
      claimedBy: { from: agent },
      closedAt: { to: at },
      lastActivity: { from: at, to: at },
      status: { from: "in_progress", to: "closed" },
      verification: {
        to: { at, by: agent, command: "vp run verify", exitCode: 0, output: "pass: 88 files\n" },
      },
    });
    // Closed with nothing claimed, the patch cleared two fields already clear, as `{}`.
    const unclaimed = event(1, "issue.close", {
      claimedAt: {},
      claimedBy: {},
      closedAt: { to: at },
      lastActivity: { from: at, to: at },
      status: { from: "open", to: "closed" },
      verification: { to: { at, by: agent, unverified: "no device here" } },
    });
    const drop = event(1, "issue.drop", {
      claimedAt: {},
      claimedBy: {},
      closedAt: { to: at },
      droppedReason: { to: "scratch" },
      lastActivity: { from: at, to: at },
      status: { from: "open", to: "dropped" },
    });
    expect(historyLines([claim, release, close, unclaimed, drop], now)).toEqual([
      "  r1  wsl/claude  2h ago  issue.claim  claimedBy — → wsl/claude, status open → in_progress",
      "  r2  wsl/claude  2h ago  issue.release  claimedBy wsl/claude → —, status in_progress → open",
      "  r3  wsl/claude  2h ago  issue.close  status in_progress → closed, verification — → vp run verify (exit 0)",
      "  r1  wsl/claude  2h ago  issue.close  status open → closed, verification — → unverified: no device here",
      "  r1  wsl/claude  2h ago  issue.drop  droppedReason — → scratch, status open → dropped",
    ]);
  });

  it("reads a blocker's raw resolve from before 2026-09-20 without its resolver or its time", () => {
    const resolve = {
      revision: 2,
      actor: human,
      at: ago(HOUR),
      kind: "blocker.resolve",
      changes: {
        resolution: { to: "done" },
        resolvedAt: { to: ago(HOUR) },
        resolvedBy: { to: human },
        status: { from: "waiting", to: "resolved" },
      },
    };
    expect(historyLines([resolve], now, "bl-1")).toEqual([
      "  r2  wsl/balder  1h ago  blocker.resolve  resolution — → done, status waiting → resolved",
    ]);
  });

  it("ends a blocker's ack and resolve with the person's words they rested on", () => {
    const ack = {
      revision: 1,
      actor: agent,
      at: ago(HOUR),
      kind: "blocker.ack",
      changes: { status: { from: "raised", to: "waiting" }, said: { to: "seen it" } },
    };
    const resolve = {
      revision: 2,
      actor: agent,
      at: ago(HOUR),
      kind: "blocker.resolve",
      changes: {
        resolution: { to: "done" },
        said: { to: "go ahead" },
        status: { from: "waiting", to: "resolved" },
      },
    };
    expect(historyLines([ack, resolve], now, "bl-1")).toEqual([
      '  r1  wsl/claude  1h ago  blocker.ack  status raised → waiting, on their word "seen it"',
      '  r2  wsl/claude  1h ago  blocker.resolve  resolution — → done, status waiting → resolved, on their word "go ahead"',
    ]);
  });
});

describe("logLine", () => {
  it("leads with the issue, then the event, actor, age and changes", () => {
    const claim = {
      at: ago(2 * HOUR),
      actor: { name: "wsl/claude", kind: "agent" } as const,
      kind: "issue.claim",
      revision: 1,
      changes: { status: { from: "open", to: "in_progress" }, claimedBy: { to: "wsl/claude" } },
      issue: { id: "cn-2", title: "scratch: second" },
      epic: undefined,
      blocker: undefined,
      project: undefined,
    };
    expect(logLine(claim, now)).toBe(
      'cn-2 "scratch: second"  issue.claim  wsl/claude  2h ago  status open → in_progress, claimedBy — → wsl/claude',
    );
  });

  it("reads a journal entry as its kind and first line, cut where the line is, never as JSON", () => {
    const noted = {
      at: ago(5 * MINUTE),
      actor: { name: "mac/claude", kind: "agent" } as const,
      kind: "journal.append",
      revision: undefined,
      changes: { kind: "finding", body: "the counter row is created on first use\n\nand why" },
      issue: { id: "cn-2", title: "scratch: second" },
      epic: undefined,
      blocker: undefined,
      project: undefined,
    };
    expect(logLine(noted, now)).toBe(
      'cn-2 "scratch: second"  journal.append  mac/claude  5m ago  finding: the counter row is created on first use…',
    );
    const long = { ...noted, changes: { kind: "handoff", body: "a".repeat(80) } };
    const [piece] = logParts(long, now).changes;
    expect(piece).toMatch(/^handoff: a+…$/);
    expect(piece).toHaveLength(80);
  });

  it("reads an edge from the end its line leads with", () => {
    const blocked = {
      at: ago(MINUTE),
      actor: { name: "wsl/claude", kind: "agent" } as const,
      kind: "edge.add",
      revision: undefined,
      changes: { type: "blocks", from: "cn-1", to: "cn-2" },
      issue: { id: "cn-2", title: "scratch: second" },
      epic: undefined,
      blocker: undefined,
      project: undefined,
    };
    expect(logLine(blocked, now)).toBe(
      'cn-2 "scratch: second"  edge.add  wsl/claude  1m ago  blocked by cn-1',
    );
    const related = {
      ...blocked,
      kind: "edge.remove",
      changes: { type: "related", from: "cn-2", to: "cn-1" },
    };
    expect(logLine(related, now)).toBe(
      'cn-2 "scratch: second"  edge.remove  wsl/claude  1m ago  related to cn-1',
    );
    const found = { ...blocked, changes: { type: "discovered-from", from: "cn-2", to: "cn-1" } };
    expect(logLine(found, now)).toBe(
      'cn-2 "scratch: second"  edge.add  wsl/claude  1m ago  discovered from cn-1',
    );
  });

  it("leads with the issue when a row names both an issue and a blocker, and reads a raise as the blocker's line", () => {
    const raise = {
      at: ago(MINUTE),
      actor: { name: "wsl/claude", kind: "agent" } as const,
      kind: "blocker.raise",
      revision: undefined,
      changes: {
        id: "bl-1",
        blockerKind: "decision",
        owner: "balder",
        title: "confirm the invite copy",
        whatResolves: "say which of the two",
        issue: "cn-2",
      },
      issue: { id: "cn-2", title: "scratch: second" },
      blocker: { id: "bl-1", title: "confirm the invite copy" },
      epic: undefined,
      project: undefined,
    };
    expect(logLine(raise, now)).toBe(
      'cn-2 "scratch: second"  blocker.raise  wsl/claude  1m ago  bl-1 "confirm the invite copy" decision · owner balder',
    );
    const attach = {
      ...raise,
      kind: "blocker.attach",
      actor: { name: "wsl/claude", kind: "agent" } as const,
      changes: { blocker: "bl-1", issue: "cn-2" },
    };
    expect(logLine(attach, now)).toBe(
      'cn-2 "scratch: second"  blocker.attach  wsl/claude  1m ago  waits on bl-1',
    );
  });

  it("reads the resolve an issue was freed by as the blocker and the note, never as JSON", () => {
    const freed = {
      at: ago(MINUTE),
      actor: { name: "wsl/balder", kind: "human" } as const,
      kind: "blocker.resolve",
      revision: undefined,
      changes: {
        blocker: "bl-1",
        title: "confirm the invite copy",
        resolution: "the short one\nit fits the card",
      },
      issue: { id: "cn-2", title: "scratch: second" },
      blocker: undefined,
      epic: undefined,
      project: undefined,
    };
    expect(logLine(freed, now)).toBe(
      'cn-2 "scratch: second"  blocker.resolve  wsl/balder  1m ago  bl-1 "confirm the invite copy": the short one…',
    );
    const long = { ...freed, changes: { ...freed.changes, resolution: "a".repeat(80) } };
    const [piece] = logParts(long, now).changes;
    expect(piece).toMatch(/^bl-1 "confirm the invite copy": a+…$/);
    expect(piece).toHaveLength(80);
  });

  it("ends the resolve an issue was freed by with the person's words, when it rested on them", () => {
    const freed = {
      at: ago(MINUTE),
      actor: { name: "wsl/claude", kind: "agent" } as const,
      kind: "blocker.resolve",
      revision: undefined,
      changes: {
        blocker: "bl-1",
        title: "confirm the invite copy",
        resolution: "the short one",
        said: "go ahead",
      },
      issue: { id: "cn-2", title: "scratch: second" },
      blocker: undefined,
      epic: undefined,
      project: undefined,
    };
    expect(logLine(freed, now)).toBe(
      'cn-2 "scratch: second"  blocker.resolve  wsl/claude  1m ago  bl-1 "confirm the invite copy": the short one, on their word "go ahead"',
    );
  });

  it("leads with the blocker when a row names no issue, its own resolve a field map", () => {
    const resolve = {
      at: ago(MINUTE),
      actor: { name: "wsl/balder", kind: "human" } as const,
      kind: "blocker.resolve",
      revision: 1,
      changes: { status: { from: "raised", to: "resolved" }, resolution: { to: "the short one" } },
      issue: undefined,
      blocker: { id: "bl-1", title: "confirm the invite copy" },
      epic: undefined,
      project: undefined,
    };
    expect(logLine(resolve, now)).toBe(
      'bl-1 "confirm the invite copy"  blocker.resolve  wsl/balder  1m ago  status raised → resolved, resolution — → the short one',
    );
  });

  it("leads with the epic when a row names neither an issue nor a blocker", () => {
    const create = {
      at: ago(2 * HOUR),
      actor: { name: "wsl/claude", kind: "agent" } as const,
      kind: "epic.create",
      revision: 0,
      changes: { id: "ep-1", title: "Create to close" },
      issue: undefined,
      blocker: undefined,
      epic: { id: "ep-1", title: "Create to close" },
      project: undefined,
    };
    expect(logLine(create, now)).toBe('ep-1 "Create to close"  epic.create  wsl/claude  2h ago');
  });

  it("reads a reconcile run, from before the verb was deleted, as what it did and who asked", () => {
    const run = {
      at: ago(9 * DAY),
      actor: { name: "cairn/reconcile", kind: "agent" } as const,
      kind: "reconcile.run",
      revision: undefined,
      changes: {
        by: "balder/balder",
        did: [
          {
            rule: "drop-edge",
            from: { id: "cn-1", title: "schema, ids, revision, events, and the first verbs" },
            to: { id: "cn-2", title: "the lifecycle, claim to close with evidence" },
          },
        ],
        owner: "balder",
        raised: [],
      },
      issue: undefined,
      blocker: undefined,
      epic: { id: "ep-1", title: "Create to close" },
      project: undefined,
    };
    expect(logLine(run, now)).toBe(
      'ep-1 "Create to close"  reconcile.run  cairn/reconcile  9d ago  did 1 · raised 0 · by balder/balder',
    );
    const idle = { ...run, changes: { by: "balder/claude", did: [], owner: "balder", raised: [] } };
    expect(logLine(idle, now)).toBe(
      'ep-1 "Create to close"  reconcile.run  cairn/reconcile  9d ago  nothing to do · by balder/claude',
    );
  });

  it("leads with — when a row names nothing, and a project's create is its slug and name", () => {
    const create = {
      at: ago(2 * HOUR),
      actor: { name: "wsl/claude", kind: "agent" } as const,
      kind: "project.create",
      revision: undefined,
      changes: { slug: "cn", name: "cairn: backend, cli, plugin" },
      issue: undefined,
      blocker: undefined,
      epic: undefined,
      project: undefined,
    };
    expect(logLine(create, now)).toBe(
      '—  project.create  wsl/claude  2h ago  cn "cairn: backend, cli, plugin"',
    );
  });

  it("names a project's update at the start of its changes, since a project never leads", () => {
    const update = logEvent({
      at: ago(MINUTE),
      kind: "project.update",
      revision: 1,
      changes: {
        name: { from: "scratch: a project", to: "scratch: the project" },
        description: { from: undefined, to: "scratch: why" },
      },
      issue: undefined,
      project: { id: "scratch", title: "scratch: the project" },
    });
    expect(logLine(update, now)).toBe(
      '—  project.update  wsl/claude  1m ago  scratch "scratch: the project": name scratch: a project → scratch: the project, description — → scratch: why',
    );
    expect(logParts({ ...update, changes: {} }, now).changes).toEqual([
      'scratch "scratch: the project"',
    ]);
    expect(logLine({ ...update, project: undefined }, now)).toBe(
      "—  project.update  wsl/claude  1m ago  name scratch: a project → scratch: the project, description — → scratch: why",
    );
  });

  it("prints no payload for a create, however big the changes it carries", () => {
    const create = {
      at: ago(2 * HOUR),
      actor: { name: "wsl/claude", kind: "agent" } as const,
      kind: "issue.create",
      revision: 0,
      changes: { id: "cn-1", title: "a".repeat(200), status: "open", requires: [], priority: 0 },
      issue: { id: "cn-1", title: "the first issue" },
      epic: undefined,
      blocker: undefined,
      project: undefined,
    };
    expect(logLine(create, now)).toBe('cn-1 "the first issue"  issue.create  wsl/claude  2h ago');
  });

  it("reads an update from before cn-119, when an issue still carried requires, as a line", () => {
    const old = {
      at: ago(2 * HOUR),
      actor: { name: "wsl/claude", kind: "agent" } as const,
      kind: "issue.update",
      revision: 1,
      changes: { requires: { from: [], to: ["ios"] } },
      issue: { id: "cn-1", title: "the first issue" },
      epic: undefined,
      blocker: undefined,
      project: undefined,
    };
    expect(logLine(old, now)).toBe(
      'cn-1 "the first issue"  issue.update  wsl/claude  2h ago  requires [] → ["ios"]',
    );
  });
});

describe("briefLines", () => {
  const claude = { name: "balder/claude", kind: "agent" } as const;
  const where = { deployment: "local", actor: "balder/claude" };
  const empty = briefView();

  it("is the six lines of design §8", () => {
    const lines = briefLines(
      {
        projects: ["app", "web"],
        ready: {
          count: 4,
          top: [
            { id: "cn-7", title: "the web window's first page", priority: 1 },
            { id: "cn-8", title: "the deployment story", priority: 2 },
            { id: "cn-9", title: "the web view", priority: 2 },
          ],
        },
        inProgress: [
          {
            id: "cn-6",
            title: "the brief and the plugin",
            claimedBy: claude,
            claimedAt: ago(2 * HOUR),
            mine: false,
          },
        ],
        followUps: [
          { id: "cn-12", title: "record explicit changes on close", followUpKind: "cleanup" },
          { id: "cn-13", title: "confirm on a phone", followUpKind: "verify" },
        ],
        waiting: 0,
      },
      where,
      now,
    );
    expect(lines).toEqual([
      "cairn · local · balder/claude",
      "projects        app · web",
      'ready 4         cn-7 "the web window\'s first page" P1 · cn-8 "the deployment story" P2 · cn-9 "the web view" P2',
      'in progress     cn-6 "the brief and the plugin" balder/claude 2h',
      'follow-ups      cn-12 "record explicit changes on close" [cleanup] · cn-13 "confirm on a phone" [verify]',
      "waiting on you  0",
    ]);
    expect(lines.length).toBeLessThan(20);
  });

  it("says none rather than nothing", () => {
    const lines = briefLines(empty, where, now);
    expect(lines).toEqual([
      "cairn · local · balder/claude",
      "projects        none",
      "ready 0         none",
      "in progress     none",
      "follow-ups      none",
      "waiting on you  0",
    ]);
    expect(lines.length).toBeLessThan(20);
  });

  it("prints no projects line when the deployment sends none, as one not yet pushed with it", () => {
    const unpushed: Partial<BriefView> = briefView();
    delete unpushed.projects;
    const lines = briefLines(unpushed as BriefView, where, now);
    expect(lines.some((line) => line.startsWith("projects"))).toBe(false);
    expect(lines).toHaveLength(5);
    expect(lines.length).toBeLessThan(20);
  });

  it("caps each queue so a glance stays a glance", () => {
    const lines = briefLines(
      {
        ...empty,
        inProgress: Array.from({ length: 7 }, (_, i) => ({
          id: `cn-${i + 1}`,
          title: "held",
          claimedBy: claude,
          claimedAt: ago(HOUR),
          mine: false,
        })),
        followUps: Array.from({ length: 5 }, (_, i) => ({
          id: `cn-${i + 20}`,
          title: "confirm it",
          followUpKind: "verify" as const,
        })),
      },
      where,
      now,
    );
    expect(lines[3]).toContain("· +2 more");
    expect(lines[3]?.split(" · ")).toHaveLength(6);
    expect(lines[4]).toBe(
      'follow-ups      cn-20 "confirm it" [verify] · cn-21 "confirm it" [verify] · cn-22 "confirm it" [verify] · +2 more',
    );
    expect(lines.length).toBeLessThan(20);
  });

  it("marks what this session holds as yours, and a silent claim with its silence", () => {
    const lines = briefLines(
      {
        ...empty,
        inProgress: [
          {
            id: "cn-37",
            title: "a session beside the actor",
            claimedBy: { ...claude, session: "s-1" },
            claimedAt: ago(5 * MINUTE),
            mine: true,
          },
          {
            id: "cn-6",
            title: "the brief and the plugin",
            claimedBy: claude,
            claimedAt: ago(3 * DAY),
            mine: false,
            silentSince: ago(26 * HOUR),
          },
          {
            id: "cn-9",
            title: "forgotten in this very session",
            claimedBy: { ...claude, session: "s-1" },
            claimedAt: ago(9 * DAY),
            mine: true,
            silentSince: ago(9 * DAY),
          },
        ],
      },
      where,
      now,
    );
    // Silence stays in hours for two days, where `1d` would hide how far past 24h it is.
    expect(lines[3]).toBe(
      'in progress     cn-37 "a session beside the actor" balder/claude 5m · yours · cn-6 "the brief and the plugin" balder/claude 3d · silent 26h · cn-9 "forgotten in this very session" balder/claude 9d · silent 9d · yours',
    );
  });
});

describe("unjournaledLine", () => {
  const session = { name: "balder/claude", kind: "agent", session: "s-1" } as const;
  const empty: BriefView["inProgress"] = [];
  const held = (over: Partial<BriefView["inProgress"][number]> = {}) => ({
    id: "cn-38",
    title: "a Stop hook hands back one state line",
    claimedBy: session,
    claimedAt: ago(3 * HOUR),
    mine: true,
    ...over,
  });

  it("is nothing when this session holds nothing the deployment marked quiet", () => {
    expect(unjournaledLine(empty, now)).toBeUndefined();
    // Held and journaled inside the threshold: no mark, so no line.
    expect(unjournaledLine([held({ lastJournal: ago(5 * MINUTE) })], now)).toBeUndefined();
    // Marked quiet, but somebody else's: not this session's to journal.
    expect(
      unjournaledLine([held({ mine: false, unjournaledSince: ago(3 * HOUR) })], now),
    ).toBeUndefined();
    expect(unjournaled([held({ mine: false, unjournaledSince: ago(3 * HOUR) })])).toEqual([]);
  });

  it("names the claim and its last entry", () => {
    const at = ago(3 * HOUR);
    expect(
      unjournaledLine(
        [held({ claimedAt: ago(5 * HOUR), lastJournal: at, unjournaledSince: at })],
        now,
      ),
    ).toBe('you hold cn-38 "a Stop hook hands back one state line", last journal 3h ago');
  });

  it("counts from the claim when nothing was journaled since it", () => {
    const claimedAt = ago(2 * HOUR);
    const line =
      'you hold cn-38 "a Stop hook hands back one state line", claimed 2h ago, nothing journaled since';
    expect(unjournaledLine([held({ claimedAt, unjournaledSince: claimedAt })], now)).toBe(line);
    // An entry older than the claim is not since it: the deployment marked the claim.
    expect(
      unjournaledLine(
        [held({ claimedAt, lastJournal: ago(9 * HOUR), unjournaledSince: claimedAt })],
        now,
      ),
    ).toBe(line);
  });

  it("is one line however many claims are quiet", () => {
    const at = ago(3 * HOUR);
    const claimedAt = ago(2 * HOUR);
    const line = unjournaledLine(
      [
        held({ lastJournal: at, unjournaledSince: at }),
        held({ id: "cn-40", title: "the other one", claimedAt, unjournaledSince: claimedAt }),
        held({ id: "cn-41", title: "fresh", claimedAt: ago(MINUTE) }),
      ],
      now,
    );
    expect(line).toBe(
      'you hold cn-38 "a Stop hook hands back one state line", last journal 3h ago · cn-40 "the other one", claimed 2h ago, nothing journaled since',
    );
    expect(line?.split("\n")).toHaveLength(1);
  });
});

describe("holdsLine and freedLine", () => {
  it("prints what a blocker holds under it", () => {
    expect(
      holdsLine([
        { id: "cn-4", title: "a" },
        { id: "cn-7", title: "b" },
      ]),
    ).toBe('  holds  cn-4 "a", cn-7 "b"');
  });

  it("prints what a resolve freed under it, the way holds reads", () => {
    expect(
      freedLine([
        { id: "cn-4", title: "a" },
        { id: "cn-7", title: "b" },
      ]),
    ).toBe('  freed  cn-4 "a", cn-7 "b"');
  });
});
