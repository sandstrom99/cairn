// An append is an insert: it takes no revision, bumps none, and therefore always lands.
// That is the guarantee the beads `--append-notes` bug broke, where 3 of 16 writes
// disappeared under load, and it is why a finding is never a field that gets rewritten.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { JOURNAL_MAX } from "../lib/limits";
import { actor, at, closeIssue, eventsOf, other, rawIssue, seed } from "./test.fixtures";

afterEach(() => vi.useRealTimers());

/** A deployment with cn-1, open at revision 0. */
const withIssue = () =>
  seed({ issues: [{ title: "the lifecycle, claim to close with evidence", priority: 0 }] });

describe("journal.append", () => {
  it("lands while another actor holds a newer revision, without moving it", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor: other, id: "cn-1" });
    const before = await rawIssue(t, "cn-1");

    at("2026-09-17T10:00:00Z");
    const entry = await t.mutation(api.journal.append, {
      actor,
      id: "cn-1",
      kind: "finding",
      body: "the counter row is created on first use",
    });
    expect(entry).toMatchObject({
      id: "cn-1",
      kind: "finding",
      body: "the counter row is created on first use",
      author: actor,
      at: Date.now(),
    });

    const after = await rawIssue(t, "cn-1");
    expect(after.revision).toBe(before.revision);
    expect(after.lastActivity).toBe(Date.now());
    expect(after.lastActivity).toBeGreaterThan(before.lastActivity);
  });

  it("records an event with no revision and the body's first line, cut to 80", async () => {
    const t = await withIssue();
    const body = "the retry path works on the Pixel\nlogcat below\nno ANR in 20 runs";
    await t.mutation(api.journal.append, { actor, id: "cn-1", kind: "evidence", body });
    await t.mutation(api.journal.append, {
      actor,
      id: "cn-1",
      kind: "finding",
      body: "e".repeat(120),
    });
    const events = await eventsOf(t, "journal.append");
    expect(events).toHaveLength(2);
    expect(events[0]!.revision).toBeUndefined();
    expect(events[0]!.changes).toEqual({
      kind: "evidence",
      body: "the retry path works on the Pixel…",
    });
    expect(events[1]!.changes).toEqual({ kind: "finding", body: `${"e".repeat(79)}…` });
  });

  it("takes an entry after a close, because evidence arrives late", async () => {
    const t = await withIssue();
    await closeIssue(t, "cn-1", 0, {
      verification: { unverified: "checked by hand on the device" },
    });
    await expect(
      t.mutation(api.journal.append, {
        actor,
        id: "cn-1",
        kind: "evidence",
        body: "the retry path works on the Pixel",
      }),
    ).resolves.toMatchObject({ kind: "evidence" });
  });

  it("refuses a blank body and an id nothing answers to", async () => {
    const t = await withIssue();
    await expect(
      t.mutation(api.journal.append, { actor, id: "cn-1", kind: "finding", body: "  " }),
    ).rejects.toMatchObject({ data: { kind: "invalid" } });
    await expect(
      t.mutation(api.journal.append, { actor, id: "cn-9", kind: "finding", body: "x" }),
    ).rejects.toMatchObject({ data: { kind: "not-found" } });
  });

  it("shows the last five, newest first", async () => {
    const t = await withIssue();
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await t.mutation(api.journal.append, {
        actor,
        id: "cn-1",
        kind: "finding",
        body: `entry ${n}`,
      });
    }
    const shown = await t.query(api.show.get, { id: "cn-1" });
    expect(shown.kind === "issue" ? shown.journal.map((e) => e.body) : []).toEqual([
      "entry 6",
      "entry 5",
      "entry 4",
      "entry 3",
      "entry 2",
    ]);
  });

  it("shows as many as asked, newest first", async () => {
    const t = await withIssue();
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await t.mutation(api.journal.append, {
        actor,
        id: "cn-1",
        kind: "finding",
        body: `entry ${n}`,
      });
    }
    const all = await t.query(api.show.get, { id: "cn-1", journal: JOURNAL_MAX });
    expect(all.kind === "issue" ? all.journal.map((e) => e.body) : []).toEqual([
      "entry 6",
      "entry 5",
      "entry 4",
      "entry 3",
      "entry 2",
      "entry 1",
    ]);
    const two = await t.query(api.show.get, { id: "cn-1", journal: 2 });
    expect(two.kind === "issue" ? two.journal.map((e) => e.body) : []).toEqual([
      "entry 6",
      "entry 5",
    ]);
  });

  it("refuses a journal count out of range", async () => {
    const t = await withIssue();
    for (const journal of [0, JOURNAL_MAX + 1, 1.5]) {
      await expect(t.query(api.show.get, { id: "cn-1", journal })).rejects.toMatchObject({
        data: { kind: "invalid" },
      });
    }
  });

  it("takes a next entry on a finished issue and refuses one on a live issue", async () => {
    const t = await withIssue();
    const next = { actor, id: "cn-1", kind: "next" as const, body: "the reader comes next" };
    await expect(t.mutation(api.journal.append, next)).rejects.toMatchObject({
      data: {
        kind: "invalid",
        message:
          "cn-1 is open; a next entry is left on a finished issue, and a handoff says where a live one stands",
      },
    });
    expect(await eventsOf(t, "journal.append")).toHaveLength(0);

    await closeIssue(t, "cn-1");
    expect(await t.mutation(api.journal.append, next)).toMatchObject({ id: "cn-1", kind: "next" });
  });
});

describe("the direction a close leaves", () => {
  /** cn-1 blocks cn-2, and cn-3 stands apart, all in ep-1. */
  const chain = async () => {
    const t = await seed({ issues: ["the writer", "the reader", "the page"] });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    return t;
  };

  it("lands as a next entry in the close's own mutation, and the close answers with it", async () => {
    at("2026-10-05T09:00:00Z");
    const t = await chain();
    const closed = await closeIssue(t, "cn-1", 0, {
      next: "the reader first\n\nit shares the codec",
    });
    expect(closed.next).toBe("the reader first\n\nit shares the codec");

    const events = await eventsOf(t, "journal.append");
    expect(events.map((e) => e.changes)).toEqual([{ kind: "next", body: "the reader first…" }]);

    const shown = await t.query(api.show.get, { id: "cn-1" });
    expect(shown.kind === "issue" && shown.next).toEqual([
      {
        from: { id: "cn-1", title: "the writer", status: "closed" },
        body: "the reader first\n\nit shares the codec",
        by: actor,
        at: expect.closeTo(Date.now(), 0),
      },
    ]);
  });

  it("refuses an empty direction and closes nothing", async () => {
    const t = await chain();
    await expect(closeIssue(t, "cn-1", 0, { next: "  " })).rejects.toMatchObject({
      data: { kind: "invalid" },
    });
    expect((await rawIssue(t, "cn-1")).status).toBe("open");
  });

  it("leaves none when the close gave none", async () => {
    const t = await chain();
    expect((await closeIssue(t, "cn-1")).next).toBeUndefined();
    const shown = await t.query(api.show.get, { id: "cn-2" });
    expect(shown.kind === "issue" && shown.next).toEqual([]);
  });

  it("is read on what the issue blocked and on its follow-up, newest first, never on a stranger", async () => {
    at("2026-10-05T09:00:00Z");
    const t = await chain();
    const { followUp } = await closeIssue(t, "cn-1", 0, {
      next: "the reader first",
      followUp: { title: "verify: the writer on a phone", kind: "verify" },
    });
    at("2026-10-05T10:00:00Z");
    await t.mutation(api.journal.append, {
      actor: other,
      id: "cn-1",
      kind: "next",
      body: "the page first after all",
    });

    const newest = {
      from: { id: "cn-1", title: "the writer", status: "closed" },
      body: "the page first after all",
      by: other,
      at: expect.closeTo(Date.now(), 0),
    };
    for (const id of ["cn-2", followUp!.id]) {
      const shown = await t.query(api.show.get, { id });
      expect(shown.kind === "issue" && shown.next).toEqual([newest]);
    }
    const apart = await t.query(api.show.get, { id: "cn-3" });
    expect(apart.kind === "issue" && apart.next).toEqual([]);
  });

  it("is read on the epic, the newest three of its finished issues", async () => {
    const t = await seed({ issues: ["one", "two", "three", "four", "five"] });
    for (const [n, hour] of [
      [1, "09"],
      [2, "10"],
      [3, "11"],
      [4, "12"],
    ] as const) {
      at(`2026-10-05T${hour}:00:00Z`);
      await closeIssue(t, `cn-${n}`, 0, { next: `after ${n}` });
    }
    const shown = await t.query(api.show.get, { id: "ep-1" });
    expect(shown.kind === "epic" && shown.next.map((d) => [d.from.id, d.body])).toEqual([
      ["cn-4", "after 4"],
      ["cn-3", "after 3"],
      ["cn-2", "after 2"],
    ]);
  });
});
