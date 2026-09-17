import { describe, expect, it } from "vitest";
import {
  type Shown,
  age,
  blockerLine,
  brief,
  edgeLine,
  epicLine,
  historyLines,
  issueLine,
  readyLine,
  staleLines,
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

describe("epicLine", () => {
  it("is the reference form and the counts, follow-ups last", () => {
    expect(
      epicLine({
        id: "ep-1",
        title: "Create to close",
        counts: { open: 2, inProgress: 1, closed: 3, followUps: 1 },
      }),
    ).toBe('ep-1 "Create to close"  2 open · 1 in progress · 3 done · 1 follow-ups');
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
    expect(text).toContain("claimed         wsl/claude · 5m");
    expect(text).toContain("requires        ios, device");
    expect(text).toContain('waiting on      bl-1 "the App Store agreement"');
    expect(text).toContain("  1h wsl/claude finding: the counter row is created on first use");
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
      issues: [{ id: "cn-1", title: "schema, ids", status: "open", priority: 0 }],
    } as unknown as Shown;
    expect(brief(shown, now).split("\n")).toEqual([
      'ep-1 "Create to close"  1 open · 0 in progress · 0 done · 0 follow-ups',
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

  it("prints what is not a field map as its JSON, and an append as having no revision", () => {
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
      '  —  mac/claude  5m ago  journal.append  {"kind":"finding","body":"the counter row is created on first use"}',
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
});
