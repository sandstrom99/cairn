// The create rules, one test each, because every one of them is a way an issue could
// become something no later verb can reason about: an id minted from the wrong counter,
// an epic that is not open, a follow-up with no kind, a priority outside 0 to 4.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const modules = import.meta.glob("../**/*.ts");

/** A deployment with two projects and one open epic, ep-1. */
async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
  await t.mutation(api.projects.create, { actor, slug: "x", name: "the other one" });
  await t.mutation(api.epics.create, { actor, title: "Create to close" });
  return t;
}

describe("issues.create", () => {
  it("mints per project: cn-1, cn-2, then x-1", async () => {
    const t = await seeded();
    const first = await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "schema, ids, revision, events, and the first verbs",
      priority: 0,
    });
    const second = await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "the lifecycle, claim to close with evidence",
    });
    const other = await t.mutation(api.issues.create, {
      actor,
      project: "x",
      epic: "ep-1",
      title: "somewhere else",
    });
    expect([first.id, second.id, other.id]).toEqual(["cn-1", "cn-2", "x-1"]);
    expect(first).toMatchObject({
      project: "cn",
      epic: { id: "ep-1", title: "Create to close" },
      type: "task",
      status: "open",
      priority: 0,
      requires: [],
      revision: 0,
    });
    expect(second.priority).toBe(2);
  });

  it("hands back the open epics when none was given", async () => {
    const t = await seeded();
    await t.mutation(api.epics.create, { actor, title: "A session starts warm" });
    await expect(
      t.mutation(api.issues.create, { actor, project: "cn", title: "no epic" }),
    ).rejects.toMatchObject({
      data: {
        kind: "epic-required",
        message: "an issue needs an epic",
        candidates: [
          { id: "ep-1", title: "Create to close" },
          { id: "ep-2", title: "A session starts warm" },
        ],
      },
    });
  });

  it("creates the inbox on the first ep-0 and reuses it after", async () => {
    const t = await seeded();
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-0", title: "one" });
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-0", title: "two" });
    const epics = await t.query(api.epics.list, { all: true });
    expect(epics.filter((e) => e.id === "ep-0")).toHaveLength(1);
    expect(epics.find((e) => e.id === "ep-0")).toMatchObject({
      title: "Inbox",
      counts: { open: 2 },
    });
  });

  it("refuses an unknown project, epic or parent", async () => {
    const t = await seeded();
    await expect(
      t.mutation(api.issues.create, { actor, project: "nope", epic: "ep-1", title: "x" }),
    ).rejects.toMatchObject({ data: { kind: "not-found", message: "no such id nope" } });
    await expect(
      t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-9", title: "x" }),
    ).rejects.toMatchObject({ data: { kind: "not-found", message: "no such id ep-9" } });
    await expect(
      t.mutation(api.issues.create, {
        actor,
        project: "cn",
        epic: "ep-1",
        title: "x",
        parent: "cn-99",
      }),
    ).rejects.toMatchObject({ data: { kind: "not-found", message: "no such id cn-99" } });
  });

  it("refuses an epic that is closed or dropped", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      const doc = await ctx.db
        .query("epics")
        .withIndex("by_public_id", (q) => q.eq("id", "ep-1"))
        .unique();
      await ctx.db.patch(doc!._id, { status: "closed" });
    });
    await expect(
      t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "x" }),
    ).rejects.toMatchObject({ data: { kind: "invalid" } });
  });

  it("pairs type and followUpKind both ways", async () => {
    const t = await seeded();
    await expect(
      t.mutation(api.issues.create, {
        actor,
        project: "cn",
        epic: "ep-1",
        title: "x",
        type: "follow-up",
      }),
    ).rejects.toMatchObject({ data: { kind: "invalid" } });
    await expect(
      t.mutation(api.issues.create, {
        actor,
        project: "cn",
        epic: "ep-1",
        title: "x",
        followUpKind: "verify",
      }),
    ).rejects.toMatchObject({ data: { kind: "invalid" } });
  });

  it("refuses a priority outside 0 to 4", async () => {
    const t = await seeded();
    for (const priority of [-1, 5, 1.5]) {
      await expect(
        t.mutation(api.issues.create, {
          actor,
          project: "cn",
          epic: "ep-1",
          title: "x",
          priority,
        }),
      ).rejects.toMatchObject({ data: { kind: "invalid" } });
    }
  });

  it("records one issue.create event on the issue and its epic", async () => {
    const t = await seeded();
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "one" });
    const events = await t.run((ctx) =>
      ctx.db
        .query("events")
        .filter((q) => q.eq(q.field("kind"), "issue.create"))
        .collect(),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor,
      revision: 0,
      changes: { id: "cn-1", status: "open" },
    });
    expect(events[0]!.issueId).toBeDefined();
    expect(events[0]!.epicId).toBeDefined();
  });
});

describe("issues.list", () => {
  it("orders by priority then age, and filters by epic, project and status", async () => {
    const t = await seeded();
    await t.mutation(api.epics.create, { actor, title: "A session starts warm" });
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "backlog",
      priority: 4,
    });
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "first urgent",
      priority: 0,
    });
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-2",
      title: "second urgent",
      priority: 0,
    });
    await t.mutation(api.issues.create, { actor, project: "x", epic: "ep-1", title: "elsewhere" });

    expect((await t.query(api.issues.list, {})).map((i) => i.title)).toEqual([
      "first urgent",
      "second urgent",
      "elsewhere",
      "backlog",
    ]);
    expect((await t.query(api.issues.list, { epic: "ep-2" })).map((i) => i.id)).toEqual(["cn-3"]);
    expect((await t.query(api.issues.list, { project: "x" })).map((i) => i.id)).toEqual(["x-1"]);

    await t.run(async (ctx) => {
      const doc = await ctx.db
        .query("issues")
        .withIndex("by_public_id", (q) => q.eq("id", "cn-1"))
        .unique();
      await ctx.db.patch(doc!._id, { status: "in_progress", claimedBy: actor });
    });
    expect((await t.query(api.issues.list, { status: "in_progress" })).map((i) => i.id)).toEqual([
      "cn-1",
    ]);
    expect((await t.query(api.issues.list, { claimedBy: actor.name })).map((i) => i.id)).toEqual([
      "cn-1",
    ]);
    expect(
      (await t.query(api.issues.list, { project: "cn", status: "open" })).map((i) => i.id),
    ).toEqual(["cn-2", "cn-3"]);
  });
});

// The lifecycle, claim to close. Each rule below is a way work could be lost or taken:
// two agents on one issue, a write against a revision that has moved, a close that
// nothing proves, residue that never gets created because the parent closed first.
const other = { name: "mac/claude", kind: "agent" } as const;
const balder = { name: "wsl/balder", kind: "human" } as const;
const ran = { command: "vp run verify", exitCode: 0, output: "Test Files  6 passed (6)" };

/** The seeded deployment plus cn-1, open and unclaimed at revision 0. */
async function withIssue() {
  const t = await seeded();
  await t.mutation(api.issues.create, {
    actor,
    project: "cn",
    epic: "ep-1",
    title: "the lifecycle, claim to close with evidence",
    priority: 0,
  });
  return t;
}

/** The events of one kind, oldest first. */
const eventsOf = (t: Awaited<ReturnType<typeof seeded>>, kind: string) =>
  t.run((ctx) =>
    ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("kind"), kind))
      .collect(),
  );

/** cn-1 as it stands in the database, past any view. */
const raw = (t: Awaited<ReturnType<typeof seeded>>, id: string) =>
  t.run((ctx) =>
    ctx.db
      .query("issues")
      .withIndex("by_public_id", (q) => q.eq("id", id))
      .unique(),
  );

describe("issues.claim", () => {
  it("is first writer wins: the second is told who holds it and since when", async () => {
    const t = await withIssue();
    const mine = await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(mine).toMatchObject({ status: "in_progress", claimedBy: actor, revision: 1 });
    expect(mine.claimedAt).toEqual(expect.any(Number));
    await expect(t.mutation(api.issues.claim, { actor: other, id: "cn-1" })).rejects.toMatchObject({
      data: { kind: "claimed", id: "cn-1", by: actor, since: mine.claimedAt },
    });
  });

  it("is idempotent for the same actor: one event, one revision", async () => {
    const t = await withIssue();
    const first = await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    const again = await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(again.revision).toBe(first.revision);
    expect(again.claimedAt).toBe(first.claimedAt);
    expect(await eventsOf(t, "issue.claim")).toHaveLength(1);
  });

  it("refuses what is closed or dropped, because reopening is not a thing", async () => {
    const t = await withIssue();
    for (const status of ["closed", "dropped"] as const) {
      const doc = await raw(t, "cn-1");
      await t.run((ctx) => ctx.db.patch(doc!._id, { status }));
      await expect(t.mutation(api.issues.claim, { actor, id: "cn-1" })).rejects.toMatchObject({
        data: { kind: "invalid", message: expect.stringContaining("follow-up") },
      });
    }
  });
});

describe("issues.release", () => {
  it("gives it back, and an agent cannot take another's claim away", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    await expect(
      t.mutation(api.issues.release, { actor: other, id: "cn-1" }),
    ).rejects.toMatchObject({ data: { kind: "claimed", by: actor } });

    const released = await t.mutation(api.issues.release, { actor, id: "cn-1" });
    expect(released).toMatchObject({ status: "open", revision: 2 });
    expect(released.claimedBy).toBeUndefined();
    expect(released.claimedAt).toBeUndefined();
  });

  it("lets a human release anybody's claim, and does nothing to an unclaimed issue", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(await t.mutation(api.issues.release, { actor: balder, id: "cn-1" })).toMatchObject({
      status: "open",
      revision: 2,
    });
    const again = await t.mutation(api.issues.release, { actor, id: "cn-1" });
    expect(again.revision).toBe(2);
    expect(await eventsOf(t, "issue.release")).toHaveLength(1);
  });
});

describe("issues.update", () => {
  it("rejects a stale revision with every change since it", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    await expect(
      t.mutation(api.issues.update, { actor: other, id: "cn-1", revision: 0, priority: 1 }),
    ).rejects.toMatchObject({
      data: {
        kind: "stale",
        id: "cn-1",
        yours: 0,
        current: 1,
        since: [{ revision: 1, actor, kind: "issue.claim" }],
      },
    });
  });

  it("takes the current revision, stamps lastActivity, and records an epic move as ids", async () => {
    const t = await withIssue();
    await t.mutation(api.epics.create, { actor, title: "A session starts warm" });
    const doc = await raw(t, "cn-1");
    await t.run((ctx) => ctx.db.patch(doc!._id, { lastActivity: 0 }));

    const updated = await t.mutation(api.issues.update, {
      actor,
      id: "cn-1",
      revision: 0,
      priority: 1,
      epic: "ep-2",
      requires: ["ios"],
    });
    expect(updated).toMatchObject({
      revision: 1,
      priority: 1,
      epic: { id: "ep-2", title: "A session starts warm" },
      requires: ["ios"],
    });
    expect(updated.lastActivity).toBeGreaterThan(0);

    const [event] = await eventsOf(t, "issue.update");
    expect(event!.changes).toEqual({
      priority: { from: 0, to: 1 },
      requires: { from: [], to: ["ios"] },
      epic: { from: "ep-1", to: "ep-2" },
    });
  });

  it("clears a deferUntil with null and leaves it alone when absent", async () => {
    const t = await withIssue();
    const when = Date.now() + 86_400_000;
    expect(
      await t.mutation(api.issues.update, { actor, id: "cn-1", revision: 0, deferUntil: when }),
    ).toMatchObject({ deferUntil: when });
    expect(
      await t.mutation(api.issues.update, { actor, id: "cn-1", revision: 1, title: "same date" }),
    ).toMatchObject({ deferUntil: when });
    const cleared = await t.mutation(api.issues.update, {
      actor,
      id: "cn-1",
      revision: 2,
      deferUntil: null,
    });
    expect(cleared.deferUntil).toBeUndefined();
  });

  it("refuses an update with nothing in it, an unknown epic and a closed issue", async () => {
    const t = await withIssue();
    await expect(
      t.mutation(api.issues.update, { actor, id: "cn-1", revision: 0 }),
    ).rejects.toMatchObject({ data: { kind: "invalid", message: "nothing to update" } });
    await expect(
      t.mutation(api.issues.update, { actor, id: "cn-1", revision: 0, epic: "ep-9" }),
    ).rejects.toMatchObject({ data: { kind: "not-found" } });

    const doc = await raw(t, "cn-1");
    await t.run((ctx) => ctx.db.patch(doc!._id, { status: "closed" }));
    await expect(
      t.mutation(api.issues.update, { actor, id: "cn-1", revision: 0, priority: 1 }),
    ).rejects.toMatchObject({ data: { kind: "invalid" } });
  });
});

describe("issues.close", () => {
  it("stores the record with who closed it and when, and clears the claim", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    const { issue, followUp } = await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 1,
      verification: ran,
    });
    expect(followUp).toBeUndefined();
    expect(issue).toMatchObject({
      status: "closed",
      revision: 2,
      verification: { ...ran, by: actor },
    });
    expect(issue.verification?.at).toEqual(expect.any(Number));
    expect(issue.closedAt).toEqual(expect.any(Number));
    expect(issue.claimedBy).toBeUndefined();
    expect(issue.claimedAt).toBeUndefined();
  });

  it("refuses a close with no record at all, at the validator", async () => {
    const t = await withIssue();
    // Deliberately untyped: the validator is what refuses, and a caller that skips the
    // record is exactly what it exists to stop.
    const noRecord = { actor, id: "cn-1", revision: 0 } as unknown as {
      actor: typeof actor;
      id: string;
      revision: number;
      verification: { unverified: string };
    };
    await expect(t.mutation(api.issues.close, noRecord)).rejects.toThrow();
    expect((await raw(t, "cn-1"))!.status).toBe("open");
  });

  it("refuses a command that failed, and an unverified close with no reason", async () => {
    const t = await withIssue();
    await expect(
      t.mutation(api.issues.close, {
        actor,
        id: "cn-1",
        revision: 0,
        verification: { command: "vp run verify", exitCode: 1, output: "1 failed" },
      }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: expect.stringContaining("exited 1") },
    });
    await expect(
      t.mutation(api.issues.close, {
        actor,
        id: "cn-1",
        revision: 0,
        verification: { unverified: "  " },
      }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "an unverified close needs a reason" },
    });
    expect((await raw(t, "cn-1"))!.status).toBe("open");
  });

  it("refuses a second close", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.close, { actor, id: "cn-1", revision: 0, verification: ran });
    await expect(
      t.mutation(api.issues.close, { actor, id: "cn-1", revision: 1, verification: ran }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "cn-1 is already closed" },
    });
  });

  it("refuses an agent closing another's claim, and lets a human do it", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor: other, id: "cn-1" });
    await expect(
      t.mutation(api.issues.close, { actor, id: "cn-1", revision: 1, verification: ran }),
    ).rejects.toMatchObject({ data: { kind: "claimed", by: other } });
    const { issue } = await t.mutation(api.issues.close, {
      actor: balder,
      id: "cn-1",
      revision: 1,
      verification: ran,
    });
    expect(issue).toMatchObject({ status: "closed", verification: { by: balder } });
  });

  it("creates the follow-up in the same mutation, linked and in the same epic", async () => {
    const t = await withIssue();
    const { issue, followUp } = await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 0,
      verification: { unverified: "verified on android and web; this machine has no ios" },
      followUp: { title: "confirm the retry path on a device", kind: "verify", requires: ["ios"] },
    });
    expect(issue.status).toBe("closed");
    expect(followUp).toMatchObject({
      id: "cn-2",
      title: "confirm the retry path on a device",
      type: "follow-up",
      followUpKind: "verify",
      status: "open",
      requires: ["ios"],
      priority: 0,
      parent: { id: "cn-1" },
      epic: { id: "ep-1" },
      revision: 0,
    });
    // The residue is counted beside the epic's tasks, never inside them.
    expect(await t.query(api.show.get, { id: "ep-1" })).toMatchObject({
      counts: { closed: 1, open: 0, followUps: 1 },
    });
  });

  it("creates neither the close nor the follow-up when the kind is not one of the three", async () => {
    const t = await withIssue();
    await expect(
      t.mutation(api.issues.close, {
        actor,
        id: "cn-1",
        revision: 0,
        verification: ran,
        followUp: { title: "ship it", kind: "ship" as unknown as "verify" },
      }),
    ).rejects.toThrow();
    expect((await raw(t, "cn-1"))!.status).toBe("open");
    expect((await t.query(api.issues.list, {})).map((i) => i.id)).toEqual(["cn-1"]);
  });
});

describe("issues.drop", () => {
  it("records the reason and the time, and refuses a blank one", async () => {
    const t = await withIssue();
    await expect(
      t.mutation(api.issues.drop, { actor, id: "cn-1", revision: 0, reason: "   " }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "dropping needs a reason" },
    });
    const dropped = await t.mutation(api.issues.drop, {
      actor,
      id: "cn-1",
      revision: 0,
      reason: "the approach it describes is gone",
    });
    expect(dropped).toMatchObject({
      status: "dropped",
      droppedReason: "the approach it describes is gone",
      revision: 1,
    });
    expect(dropped.closedAt).toEqual(expect.any(Number));
  });
});
