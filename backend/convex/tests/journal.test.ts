// An append is an insert: it takes no revision, bumps none, and therefore always lands.
// That is the guarantee the beads `--append-notes` bug broke, where 3 of 16 writes
// disappeared under load, and it is why a finding is never a field that gets rewritten.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
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
    const before = (await rawIssue(t, "cn-1"))!;

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

    const after = (await rawIssue(t, "cn-1"))!;
    expect(after.revision).toBe(before.revision);
    expect(after.lastActivity).toBe(Date.now());
    expect(after.lastActivity).toBeGreaterThan(before.lastActivity);
  });

  it("records an event with no revision and the head of the body", async () => {
    const t = await withIssue();
    const body = "e".repeat(120);
    await t.mutation(api.journal.append, { actor, id: "cn-1", kind: "evidence", body });
    const events = await eventsOf(t, "journal.append");
    expect(events).toHaveLength(1);
    expect(events[0]!.revision).toBeUndefined();
    expect(events[0]!.changes).toEqual({ kind: "evidence", body: "e".repeat(80) });
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
});
