import { describe, expect, it } from "vitest";
import { type Shown, age, brief, epicLine, issueLine } from "./format.mts";

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
  waitingOn: [],
  followUps: [],
} as unknown as Shown;

describe("brief", () => {
  it("opens with the reference form and leaves out what is empty", () => {
    const lines = brief(issue, now).split("\n");
    expect(lines[0]).toBe('cn-1 "schema, ids, revision, events"');
    expect(lines[1]).toBe('epic       ep-1 "Create to close"');
    expect(lines[3]).toBe("status     open · P0 · created 2h ago · revision 0");
    expect(brief(issue, now)).not.toMatch(/blocks|waiting on|journal|acceptance/);
  });

  it("says created just now, not created just now ago", () => {
    const fresh = { ...issue, createdAt: now - 1_000 } as Shown;
    expect(brief(fresh, now)).toContain("created just now · revision 0");
  });

  it("marks a design that continues past its first line", () => {
    expect(brief(issue, now)).toMatch(/design {5}transcribe §3…/);
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
    expect(text).toContain("claimed    wsl/claude · 5m");
    expect(text).toContain("requires   ios, device");
    expect(text).toContain('waiting on bl-1 "the App Store agreement"');
    expect(text).toContain("  1h wsl/claude finding: the counter row is created on first use");
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

  it("prints a blocker as who must act and what it holds", () => {
    const shown = {
      kind: "blocker",
      id: "bl-1",
      title: "the App Store agreement",
      blockerKind: "approval",
      owner: "balder",
      status: "raised",
      issues: [{ id: "cn-1", title: "schema, ids" }],
    } as unknown as Shown;
    expect(brief(shown, now).split("\n")).toEqual([
      'bl-1 "the App Store agreement"',
      "kind       approval",
      "owner      balder",
      "status     raised",
      'issues     cn-1 "schema, ids"',
    ]);
  });
});
