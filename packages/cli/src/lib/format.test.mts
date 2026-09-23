import { describe, expect, it } from "vitest";
import {
  type BriefView,
  type ReviewView,
  type Shown,
  age,
  blockerLine,
  blockerParts,
  brief,
  briefLines,
  changePieces,
  closedLines,
  edgeLine,
  epicClosedLines,
  epicDoneLine,
  freedLine,
  healthLines,
  healthParts,
  historyLines,
  holdsLine,
  issueLine,
  logLine,
  logParts,
  nearLine,
  placedLine,
  projectLine,
  proofParts,
  readyLine,
  reviewLines,
  staleLines,
  stateLine,
  stateParts,
  unjournaled,
  unjournaledLine,
} from "./format.mts";

const now = Date.UTC(2026, 8, 17, 12, 0, 0);
const ago = (ms: number): number => now - ms;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("age", () => {
  it("is one token, coarsening as it gets older", () => {
    expect(age(ago(30_000), now)).toBe("just now");
    expect(age(ago(5 * MINUTE), now)).toBe("5m");
    expect(age(ago(2 * HOUR), now)).toBe("2h");
    expect(age(ago(3 * DAY), now)).toBe("3d");
  });

  it("never reads negative when a clock is ahead", () => {
    expect(age(now + HOUR, now)).toBe("just now");
  });
});

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
    counts: { open: 0, inProgress: 0, closed: 2, followUps: 1 },
    health: { moving: [], waiting: [] },
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
            stuck: { id: "cn-9", title: "the page's live feed", lastActivity: ago(9 * DAY) },
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
});

describe("reviewLines", () => {
  const epic = {
    id: "ep-1",
    title: "Create to close",
    revision: 0,
    counts: { open: 2, inProgress: 1, closed: 1, dropped: 0, followUps: 1 },
  };
  const quiet = {
    epic,
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
      ...epic,
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
  const issue = {
    id: "cn-6",
    title: "the same title",
    status: "closed",
    priority: 2,
    epic: { id: "ep-2", title: "scratch: review" },
    revision: 3,
  };

  it("is the issue line alone when the close made nothing else", () => {
    expect(closedLines({ issue })).toEqual([
      'cn-6 "the same title" P2 closed  ep-2 "scratch: review" r3',
    ]);
  });

  it("prints the follow-up the same mutation made under it, and the epic's offer last", () => {
    expect(
      closedLines({
        issue,
        followUp: {
          id: "cn-8",
          title: "verify: the same title",
          status: "open",
          priority: 2,
          epic: issue.epic,
          revision: 0,
        },
        epicDone: { id: "ep-2", title: "scratch: review", revision: 0 },
      }),
    ).toEqual([
      'cn-6 "the same title" P2 closed  ep-2 "scratch: review" r3',
      '  follow-up  cn-8 "verify: the same title" P2 open  ep-2 "scratch: review" r0',
      '  epic       ep-2 "scratch: review" can close · cn epic close ep-2 --revision 0',
    ]);
  });
});

describe("epicClosedLines", () => {
  const epic = { id: "ep-3", title: "An epic tells the truth", revision: 2 };
  const closed = (followUps: number) => ({
    epic: { ...epic, status: "closed", counts: { followUps } },
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
        epic: { ...epic, status: "dropped", counts: { followUps: 0 } },
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

describe("readyLine", () => {
  const row = {
    id: "cn-4",
    title: "confirm the retry path on a device",
    status: "open",
    priority: 1,
    epic: { id: "ep-1", title: "Create to close" },
  };

  it("is the issue line while this session can do it", () => {
    expect(readyLine({ ...row, cannot: [] })).toBe(issueLine(row));
  });

  it("marks what this session cannot do, rather than hiding the row", () => {
    expect(readyLine({ ...row, cannot: ["ios", "device"] })).toBe(
      `${issueLine(row)} · needs ios, device`,
    );
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

const issue = {
  kind: "issue",
  id: "cn-1",
  project: "cn",
  epic: { id: "ep-1", title: "Create to close" },
  title: "schema, ids, revision, events",
  design: "transcribe §3\nthen the functions",
  requires: [],
  status: "open",
  priority: 0,
  lastActivity: ago(HOUR),
  revision: 0,
  createdAt: ago(2 * HOUR),
  journal: [],
  blocks: [],
  blockedBy: [],
  related: [],
  discoveredFrom: [],
  duplicates: [],
  supersedes: [],
  waitingOn: [],
  followUps: [],
} as unknown as Shown;

describe("brief", () => {
  it("opens with the reference form and leaves out what is empty", () => {
    const lines = brief(issue, now).split("\n");
    expect(lines[0]).toBe('cn-1 "schema, ids, revision, events"');
    expect(lines[1]).toBe('epic            ep-1 "Create to close"');
    expect(lines[3]).toBe("status          open · P0 · created 2h ago · revision 0");
    expect(brief(issue, now)).not.toMatch(/blocks|waiting on|journal|acceptance/);
  });

  it("says created just now, not created just now ago", () => {
    const fresh = { ...issue, createdAt: now - 1_000 } as Shown;
    expect(brief(fresh, now)).toContain("created just now · revision 0");
  });

  it("marks a design that continues past its first line", () => {
    expect(brief(issue, now)).toMatch(/design {10}transcribe §3…/);
  });

  it("prints the neighbourhood and the journal when there is any", () => {
    const shown = {
      ...issue,
      status: "in_progress",
      claimedBy: { name: "wsl/claude", kind: "agent" },
      claimedAt: ago(5 * MINUTE),
      requires: ["ios", "device"],
      waitingOn: [{ id: "bl-1", title: "the App Store agreement" }],
      followUps: [{ id: "cn-2", title: "check it on a device" }],
      journal: [
        {
          author: { name: "wsl/claude", kind: "agent" },
          kind: "finding",
          body: "the counter row is created on first use",
          at: ago(HOUR),
        },
      ],
    } as unknown as Shown;
    const text = brief(shown, now);
    expect(text).toContain(
      "status          moving wsl/claude 5m · P0 · created 2h ago · revision 0",
    );
    expect(text).not.toContain("claimed");
    expect(text).toContain("requires        ios, device");
    expect(text).toContain('waiting on      bl-1 "the App Store agreement"');
    expect(text).toContain("  1h wsl/claude finding: the counter row is created on first use");
  });

  it("opens the status line with the state word alone where the things it names have their own line", () => {
    const waiting = {
      ...issue,
      waitingOn: [{ id: "bl-1", title: "the App Store agreement" }],
    } as unknown as Shown;
    expect(brief(waiting, now).split("\n").slice(3, 5)).toEqual([
      "status          waiting · P0 · created 2h ago · revision 0",
      'waiting on      bl-1 "the App Store agreement"',
    ]);
    const blocked = {
      ...issue,
      blockedBy: [{ id: "cn-2", title: "the lifecycle", status: "open" }],
    } as unknown as Shown;
    expect(brief(blocked, now).split("\n").slice(3, 5)).toEqual([
      "status          blocked · P0 · created 2h ago · revision 0",
      'blocked by      cn-2 "the lifecycle"',
    ]);
  });

  it("prints the description's first line before the design's", () => {
    const shown = {
      ...issue,
      description: "Balder, 2026-09-21: the journal is the most context an issue has.\n\nMore.",
    } as unknown as Shown;
    expect(brief(shown, now).split("\n").slice(4, 6)).toEqual([
      "description     Balder, 2026-09-21: the journal is the most context an issue has.…",
      "design          transcribe §3…",
    ]);
  });

  it("prints the proof a close stored, and the reason a drop gave", () => {
    const closed = {
      ...issue,
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
    } as unknown as Shown;
    expect(brief(closed, now).split("\n").slice(3, 5)).toEqual([
      "status          closed 1h ago · P0 · created 2h ago · revision 4",
      "proof           vp run verify (exit 0) by wsl/claude 1h ago",
    ]);
    expect(brief(closed, now)).not.toContain("33 passed");
    const unverified = {
      ...closed,
      verification: {
        unverified: "ran on the device, see the evidence entry",
        at: ago(HOUR),
        by: { name: "wsl/claude", kind: "agent" },
      },
    } as unknown as Shown;
    expect(brief(unverified, now)).toContain(
      "proof           unverified by wsl/claude 1h ago: ran on the device, see the evidence entry",
    );
    const dropped = {
      ...issue,
      status: "dropped",
      closedAt: ago(2 * HOUR),
      droppedReason: "not going to happen",
    } as unknown as Shown;
    expect(brief(dropped, now).split("\n").slice(3, 5)).toEqual([
      "status          dropped 2h ago · P0 · created 2h ago · revision 0",
      "reason          not going to happen",
    ]);
  });

  it("marks a blocking edge whose far end is finished as done, and it does not block", () => {
    const shown = {
      ...issue,
      blocks: [{ id: "cn-3", title: "the graph", status: "dropped" }],
      blockedBy: [
        { id: "cn-2", title: "the lifecycle", status: "closed" },
        { id: "cn-4", title: "the brief", status: "in_progress" },
      ],
    } as unknown as Shown;
    const lines = brief(shown, now).split("\n");
    expect(lines.slice(3, 6)).toEqual([
      "status          blocked · P0 · created 2h ago · revision 0",
      'blocks          cn-3 "the graph" dropped',
      'blocked by      cn-2 "the lifecycle" done, cn-4 "the brief"',
    ]);
    const done = {
      ...shown,
      blockedBy: [{ id: "cn-2", title: "the lifecycle", status: "closed" }],
    } as unknown as Shown;
    expect(brief(done, now).split("\n")[3]).toBe(
      "status          open · P0 · created 2h ago · revision 0",
    );
  });

  it("prints each edge type on its own line, blocking ones first", () => {
    const shown = {
      ...issue,
      blocks: [{ id: "cn-3", title: "the graph" }],
      blockedBy: [{ id: "cn-2", title: "the lifecycle" }],
      related: [{ id: "cn-4", title: "the brief" }],
      discoveredFrom: [{ id: "cn-2", title: "the lifecycle" }],
      duplicates: [{ id: "cn-5", title: "a duplicate" }],
      supersedes: [{ id: "cn-6", title: "the old plan" }],
    } as unknown as Shown;
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
    const shown = { ...issue, events: [changed] } as unknown as Shown;
    const lines = brief(shown, now).split("\n");
    expect(lines.at(-2)).toBe("history");
    expect(lines.at(-1)).toBe(
      "  r4  wsl/claude  2h ago  issue.update  priority 2 → 1, epic ep-1 → ep-2",
    );
  });

  it("prints an epic as its line, its description and its open issues", () => {
    const shown = {
      kind: "epic",
      id: "ep-1",
      title: "Create to close",
      description: "an agent creates, claims, journals and closes work",
      status: "open",
      revision: 0,
      createdAt: ago(DAY),
      counts: { open: 1, inProgress: 0, closed: 0, dropped: 0, followUps: 0 },
      health: {
        moving: [],
        waiting: [{ id: "bl-3", title: "confirm the invite copy", owner: "balder" }],
      },
      issues: [{ id: "cn-1", title: "schema, ids", status: "open", priority: 0 }],
    } as unknown as Shown;
    expect(brief(shown, now).split("\n")).toEqual([
      'ep-1 "Create to close"  0 done · 1 open · 0 follow-ups',
      '  waiting  bl-3 "confirm the invite copy" · owner balder',
      "an agent creates, claims, journals and closes work",
      '  cn-1 "schema, ids" P0 open',
    ]);
  });

  it("prints a blocker as who must act, what would end it and what it holds", () => {
    const shown = {
      kind: "blocker",
      id: "bl-1",
      title: "the App Store agreement",
      blockerKind: "approval",
      owner: "balder",
      whatResolves: "accept it in App Store Connect",
      nudgeAt: Date.UTC(2026, 9, 1),
      status: "raised",
      raisedBy: { name: "wsl/claude", kind: "agent" },
      raisedAt: ago(2 * HOUR),
      revision: 0,
      issues: [{ id: "cn-1", title: "schema, ids" }],
    } as unknown as Shown;
    expect(brief(shown, now).split("\n")).toEqual([
      'bl-1 "the App Store agreement"',
      "kind            approval · owner balder",
      "status          raised 2h ago by wsl/claude",
      "resolves when   accept it in App Store Connect",
      "nudge           2026-10-01",
      'holds           cn-1 "schema, ids"',
    ]);
  });

  it("prints who ended a resolved blocker, and its history when it was asked for", () => {
    const shown = {
      kind: "blocker",
      id: "bl-1",
      title: "the App Store agreement",
      blockerKind: "approval",
      owner: "balder",
      whatResolves: "accept it in App Store Connect",
      status: "resolved",
      raisedBy: { name: "wsl/claude", kind: "agent" },
      raisedAt: ago(DAY),
      resolvedBy: { name: "wsl/balder", kind: "human" },
      resolvedAt: ago(HOUR),
      resolution: "accepted",
      revision: 1,
      issues: [],
      events: [changed],
    } as unknown as Shown;
    const lines = brief(shown, now).split("\n");
    expect(lines).toContain("status          resolved · raised 1d ago by wsl/claude");
    expect(lines).toContain("resolved        by wsl/balder 1h ago: accepted");
    expect(lines.at(-2)).toBe("history");
  });
});

describe("stateParts", () => {
  const shown = issue as Extract<Shown, { kind: "issue" }>;
  const at = <T extends object>(patch: T) => ({ ...shown, ...patch }) as typeof shown;

  it("is one word and what it rests on, in the order the words matter", () => {
    expect(
      stateParts(
        at({
          status: "in_progress",
          claimedBy: { name: "wsl/claude", kind: "agent" },
          claimedAt: ago(2 * HOUR),
        }),
        now,
      ),
    ).toEqual({ word: "moving", tail: "wsl/claude 2h" });
    const held = { id: "bl-4", title: "name the day" };
    expect(stateParts(at({ waitingOn: [held], stuck: true }), now)).toEqual({
      word: "waiting",
      tail: "on",
      refs: [held],
    });
    expect(stateParts(at({ stuck: true, lastActivity: ago(9 * DAY) }), now)).toEqual({
      word: "stuck",
      tail: "silent 9d",
    });
    const live = { id: "cn-2", title: "the lifecycle", status: "open" as const };
    const done = { id: "cn-3", title: "the graph", status: "closed" as const };
    expect(stateParts(at({ blockedBy: [done, live] }), now)).toEqual({
      word: "blocked",
      tail: "by",
      refs: [live],
    });
    expect(stateParts(at({ deferUntil: Date.UTC(2026, 9, 1) }), now)).toEqual({
      word: "deferred",
      tail: "until 2026-10-01",
    });
    expect(stateParts(at({ deferUntil: ago(DAY) }), now)).toEqual({ word: "open" });
    expect(stateParts(at({ status: "closed", closedAt: ago(HOUR) }), now)).toEqual({
      word: "closed",
      tail: "1h ago",
    });
    expect(stateParts(at({ status: "dropped", closedAt: ago(HOUR) }), now)).toEqual({
      word: "dropped",
      tail: "1h ago",
    });
    expect(stateParts(shown, now)).toEqual({ word: "open" });
  });

  it("joins to one run, the things it names in the reference form", () => {
    expect(
      stateLine({ word: "waiting", tail: "on", refs: [{ id: "bl-4", title: "name the day" }] }),
    ).toBe('waiting on bl-4 "name the day"');
    expect(stateLine({ word: "moving", tail: "wsl/claude 2h" })).toBe("moving wsl/claude 2h");
    expect(stateLine({ word: "open" })).toBe("open");
  });
});

describe("proofParts", () => {
  const by = { name: "wsl/claude", kind: "agent" as const };

  it("keeps what ran apart from who closed on it, and carries the output whole", () => {
    expect(
      proofParts(
        { command: "vp run verify", exitCode: 0, output: "all green", at: ago(HOUR), by },
        now,
      ),
    ).toEqual({ ran: "vp run verify (exit 0)", text: "by wsl/claude 1h ago", output: "all green" });
  });

  it("ends an unverified close with its reason, and has nothing that ran", () => {
    expect(proofParts({ unverified: "no device to hand", at: ago(HOUR), by }, now)).toEqual({
      text: "unverified by wsl/claude 1h ago: no device to hand",
    });
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
  actor: { name: "wsl/claude" },
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
              changes: { status: { from: "open", to: "in_progress" }, claimedAt: { to: now } },
            },
          ],
        },
        now,
      ),
    ).toEqual([
      `  r1  wsl/claude  just now  issue.claim  status open → in_progress, claimedAt — → ${now}`,
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
    };
    expect(logLine(freed, now)).toBe(
      'cn-2 "scratch: second"  blocker.resolve  wsl/balder  1m ago  bl-1 "confirm the invite copy": the short one…',
    );
    const long = { ...freed, changes: { ...freed.changes, resolution: "a".repeat(80) } };
    const [piece] = logParts(long, now).changes;
    expect(piece).toMatch(/^bl-1 "confirm the invite copy": a+…$/);
    expect(piece).toHaveLength(80);
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
    };
    expect(logLine(create, now)).toBe('ep-1 "Create to close"  epic.create  wsl/claude  2h ago');
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
    };
    expect(logLine(create, now)).toBe(
      '—  project.create  wsl/claude  2h ago  cn "cairn: backend, cli, plugin"',
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
    };
    expect(logLine(create, now)).toBe('cn-1 "the first issue"  issue.create  wsl/claude  2h ago');
  });
});

describe("briefLines", () => {
  const claude = { name: "balder/claude", kind: "agent" } as const;
  const where = { deployment: "local", actor: "balder/claude", can: ["web"] };
  const empty: BriefView = {
    ready: { count: 0, top: [] },
    inProgress: [],
    followUps: { count: 0, covered: [] },
    waiting: 0,
  };

  it("is the five lines of design §8", () => {
    const lines = briefLines(
      {
        ready: {
          count: 4,
          top: [
            { id: "cn-7", title: "the web window's first page", priority: 1, cannot: [] },
            { id: "cn-8", title: "the deployment story", priority: 2, cannot: [] },
            { id: "cn-9", title: "the web view", priority: 2, cannot: ["decision"] },
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
        followUps: {
          count: 2,
          covered: [
            {
              id: "cn-12",
              title: "record explicit changes on close",
              followUpKind: "cleanup",
              requires: [],
            },
          ],
        },
        waiting: 0,
      },
      where,
      now,
    );
    expect(lines).toEqual([
      "cairn · local · balder/claude can web",
      'ready 4         cn-7 "the web window\'s first page" P1 · cn-8 "the deployment story" P2 · cn-9 "the web view" P2 · needs decision',
      'in progress     cn-6 "the brief and the plugin" balder/claude 2h',
      'follow-ups      cn-12 "record explicit changes on close" [cleanup] · 1 more needs what you lack',
      "waiting on you  0",
    ]);
    expect(lines.length).toBeLessThan(20);
  });

  it("says none rather than nothing", () => {
    const lines = briefLines(empty, where, now);
    expect(lines).toEqual([
      "cairn · local · balder/claude can web",
      "ready 0         none",
      "in progress     none",
      "follow-ups      none",
      "waiting on you  0",
    ]);
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
        followUps: {
          count: 7,
          covered: Array.from({ length: 5 }, (_, i) => ({
            id: `cn-${i + 20}`,
            title: "confirm it",
            followUpKind: "verify" as const,
            requires: [],
          })),
        },
      },
      where,
      now,
    );
    expect(lines[2]).toContain("· +2 more");
    expect(lines[2]?.split(" · ")).toHaveLength(6);
    expect(lines[3]).toBe(
      'follow-ups      cn-20 "confirm it" [verify] · cn-21 "confirm it" [verify] · cn-22 "confirm it" [verify] · +2 more · 2 more need what you lack',
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
    expect(lines[2]).toBe(
      'in progress     cn-37 "a session beside the actor" balder/claude 5m · yours · cn-6 "the brief and the plugin" balder/claude 3d · silent 26h · cn-9 "forgotten in this very session" balder/claude 9d · silent 9d · yours',
    );
  });

  it("names no capabilities when the session declared none", () => {
    const [head] = briefLines(empty, { ...where, can: [] }, now);
    expect(head).toBe("cairn · local · balder/claude");
  });
});

describe("unjournaledLine", () => {
  const session = { name: "balder/claude", kind: "agent", session: "s-1" } as const;
  const empty: BriefView = {
    ready: { count: 0, top: [] },
    inProgress: [],
    followUps: { count: 0, covered: [] },
    waiting: 0,
  };
  const held = (over: Partial<BriefView["inProgress"][number]> = {}) => ({
    id: "cn-38",
    title: "a Stop hook hands back one state line",
    claimedBy: session,
    claimedAt: ago(3 * HOUR),
    mine: true,
    ...over,
  });
  const view = (...rows: BriefView["inProgress"]): BriefView => ({ ...empty, inProgress: rows });

  it("is nothing when this session holds nothing the deployment marked quiet", () => {
    expect(unjournaledLine(empty, now)).toBeUndefined();
    // Held and journaled inside the threshold: no mark, so no line.
    expect(unjournaledLine(view(held({ lastJournal: ago(5 * MINUTE) })), now)).toBeUndefined();
    // Marked quiet, but somebody else's: not this session's to journal.
    expect(
      unjournaledLine(view(held({ mine: false, unjournaledSince: ago(3 * HOUR) })), now),
    ).toBeUndefined();
    expect(unjournaled(view(held({ mine: false, unjournaledSince: ago(3 * HOUR) })))).toEqual([]);
  });

  it("names the claim and its last entry", () => {
    const at = ago(3 * HOUR);
    expect(
      unjournaledLine(
        view(held({ claimedAt: ago(5 * HOUR), lastJournal: at, unjournaledSince: at })),
        now,
      ),
    ).toBe('you hold cn-38 "a Stop hook hands back one state line", last journal 3h ago');
  });

  it("counts from the claim when nothing was journaled since it", () => {
    const claimedAt = ago(2 * HOUR);
    const line =
      'you hold cn-38 "a Stop hook hands back one state line", claimed 2h ago, nothing journaled since';
    expect(unjournaledLine(view(held({ claimedAt, unjournaledSince: claimedAt })), now)).toBe(line);
    // An entry older than the claim is not since it: the deployment marked the claim.
    expect(
      unjournaledLine(
        view(held({ claimedAt, lastJournal: ago(9 * HOUR), unjournaledSince: claimedAt })),
        now,
      ),
    ).toBe(line);
  });

  it("is one line however many claims are quiet", () => {
    const at = ago(3 * HOUR);
    const claimedAt = ago(2 * HOUR);
    const line = unjournaledLine(
      view(
        held({ lastJournal: at, unjournaledSince: at }),
        held({ id: "cn-40", title: "the other one", claimedAt, unjournaledSince: claimedAt }),
        held({ id: "cn-41", title: "fresh", claimedAt: ago(MINUTE) }),
      ),
      now,
    );
    expect(line).toBe(
      'you hold cn-38 "a Stop hook hands back one state line", last journal 3h ago · cn-40 "the other one", claimed 2h ago, nothing journaled since',
    );
    expect(line?.split("\n")).toHaveLength(1);
  });
});

// The `…Parts` are what apps/web sets as rows. The lines above are defined over them, so
// what is held here is the seam itself: the pieces a surface with columns gets, and that
// joined the way the line joins them they are the line.
describe("the parts a line is joined from", () => {
  it("gives an epic's health as the epic, its counts as one run, and a row per fact", () => {
    const view = {
      id: "ep-3",
      title: "An epic tells the truth",
      counts: { open: 1, inProgress: 1, closed: 2, followUps: 1 },
      health: {
        moving: [
          {
            id: "cn-7",
            title: "epic health",
            claimedBy: { name: "wsl/claude" },
            claimedAt: ago(2 * HOUR),
          },
        ],
        stuck: { id: "cn-9", title: "the page's live feed", lastActivity: ago(9 * DAY) },
        waiting: [{ id: "bl-3", title: "confirm the invite copy", owner: "balder" }],
      },
    };
    const parts = healthParts(view, now);
    expect(parts.counts).toBe("2 done · 2 open · 1 follow-up");
    expect(parts.rows.map((row) => [row.fact, row.target.id, row.tail])).toEqual([
      ["moving", "cn-7", "wsl/claude 2h"],
      ["stuck", "cn-9", "silent 9d"],
      ["waiting", "bl-3", "· owner balder"],
    ]);
    expect(healthLines(view, now)).toHaveLength(1 + parts.rows.length);
  });

  it("gives a blocker as its reference, its kind and the rest, which joined are its line", () => {
    const view = {
      id: "bl-1",
      title: "the App Store agreement",
      blockerKind: "approval",
      owner: "balder",
      status: "waiting",
      raisedAt: ago(5 * MINUTE),
      raisedBy: { name: "wsl/claude" },
    };
    const { target, kind, tail } = blockerParts(view, now);
    expect(tail).toBe("owner balder · waiting · raised 5m ago by wsl/claude");
    expect(`${target.id} ${JSON.stringify(target.title)} ${kind} · ${tail}`).toBe(
      blockerLine(view, now),
    );
  });

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

  it("gives an event's payload a change at a time", () => {
    expect(
      changePieces({ status: { from: "open", to: "closed" }, priority: { from: 2, to: 1 } }),
    ).toEqual(["status open → closed", "priority 2 → 1"]);
    expect(changePieces(undefined)).toEqual([]);
    expect(changePieces(["not", "a", "field", "map"])).toEqual(['["not","a","field","map"]']);
  });

  it("cuts inside the change the limit lands in, and drops the ones after it", () => {
    const pieces = changePieces({
      title: { from: "a".repeat(40), to: "b".repeat(40) },
      priority: { from: 2, to: 1 },
    });
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatch(/…$/);
    expect(pieces.join(", ")).toHaveLength(80);
  });

  it("keeps a whole change and cuts the next, when the limit lands in the second", () => {
    const pieces = changePieces({
      priority: { from: 2, to: 1 },
      title: { from: "a".repeat(40), to: "b".repeat(40) },
    });
    expect(pieces[0]).toBe("priority 2 → 1");
    expect(pieces[1]).toMatch(/^title a+ → b+…$/);
    expect(pieces.join(", ")).toHaveLength(80);
  });

  it("gives an event as its pieces, with no payload for a create and no target where none is named", () => {
    const created = {
      at: ago(HOUR),
      actor: { name: "wsl/claude", kind: "agent" } as const,
      kind: "issue.create",
      revision: 0,
      changes: { title: { to: "x" } },
      issue: { id: "cn-2", title: "scratch: second" },
      epic: undefined,
      blocker: undefined,
    };
    expect(logParts(created, now)).toEqual({
      target: { id: "cn-2", title: "scratch: second" },
      kind: "issue.create",
      actor: "wsl/claude",
      when: "1h ago",
      changes: [],
    });
    expect(
      logParts({ ...created, kind: "project.create", issue: undefined }, now).target,
    ).toBeUndefined();
  });
});
