import { describe, expect, it } from "vitest";
import { blockerLine, healthLines } from "./lines.mts";
import {
  blockerParts,
  changePieces,
  healthParts,
  logParts,
  proofParts,
  stateLine,
  stateParts,
} from "./parts.mts";
import { DAY, HOUR, MINUTE, ago, issue, now } from "./testing.mts";

describe("stateParts", () => {
  it("is one word and what it rests on, in the order the words matter", () => {
    expect(
      stateParts(
        issue({
          status: "in_progress",
          claimedBy: { name: "wsl/claude", kind: "agent" },
          claimedAt: ago(2 * HOUR),
        }),
        now,
      ),
    ).toEqual({ word: "moving", tail: "wsl/claude 2h" });
    const held = { id: "bl-4", title: "name the day" };
    expect(stateParts(issue({ waitingOn: [held], stuck: true }), now)).toEqual({
      word: "waiting",
      tail: "on",
      refs: [held],
    });
    expect(stateParts(issue({ stuck: true, lastActivity: ago(9 * DAY) }), now)).toEqual({
      word: "stuck",
      tail: "silent 9d",
    });
    const live = { id: "cn-2", title: "the lifecycle", status: "open" as const };
    const done = { id: "cn-3", title: "the graph", status: "closed" as const };
    expect(stateParts(issue({ blockedBy: [done, live] }), now)).toEqual({
      word: "blocked",
      tail: "by",
      refs: [live],
    });
    expect(stateParts(issue({ deferUntil: Date.UTC(2026, 9, 1) }), now)).toEqual({
      word: "deferred",
      tail: "until 2026-10-01",
    });
    expect(stateParts(issue({ deferUntil: ago(DAY) }), now)).toEqual({ word: "open" });
    expect(stateParts(issue({ status: "closed", closedAt: ago(HOUR) }), now)).toEqual({
      word: "closed",
      tail: "1h ago",
    });
    expect(stateParts(issue({ status: "dropped", closedAt: ago(HOUR) }), now)).toEqual({
      word: "dropped",
      tail: "1h ago",
    });
    expect(stateParts(issue(), now)).toEqual({ word: "open" });
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

// The `…Parts` are what apps/web sets as rows. The lines are defined over them, so what
// is held here is the seam itself: the pieces a surface with columns gets, and that joined
// the way the line joins them they are the line.
describe("the parts a line is joined from", () => {
  it("gives an epic's health as the epic, its counts as one run, and a row per fact", () => {
    const view = {
      id: "ep-3",
      title: "An epic tells the truth",
      lastActivity: now - DAY,
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
