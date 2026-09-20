// Epics mint ep-1 upward, list open first, and carry counts computed on every read.
// The counts are the interesting part: follow-ups sit outside the denominator, so an
// epic's progress cannot be diluted by its own residue (docs/design.md §5). Beside them
// is health (§8): what is moving, what is stuck, what waits on a person — every line a
// fact with a query behind it, and none of them a percentage.
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { DAY } from "../lib/thresholds";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const balder = { name: "wsl/balder", kind: "human" } as const;
const modules = import.meta.glob("../**/*.ts");

/** A deployment with one project and ep-1, and `n` open issues in it. */
async function seeded(n: number) {
  const t = convexTest(schema, modules);
  await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
  await t.mutation(api.epics.create, { actor, title: "Create to close" });
  for (let i = 1; i <= n; i++)
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: `work ${i}` });
  return t;
}

type Harness = Awaited<ReturnType<typeof seeded>>;

/** Only the clock is faked, so convex-test's own async is untouched. */
const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

const healthOf = async (t: Harness, id = "ep-1") =>
  (await t.query(api.epics.health, { id })).health;

afterEach(() => vi.useRealTimers());

describe("epics", () => {
  it("mints ep-1 then ep-2 and starts every count at zero", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(api.epics.create, { actor, title: "Create to close" });
    const second = await t.mutation(api.epics.create, {
      actor,
      title: "A session starts warm",
      description: "the hook, the skill, the brief",
    });
    expect(first.id).toBe("ep-1");
    expect(first.counts).toEqual({ open: 0, inProgress: 0, closed: 0, dropped: 0, followUps: 0 });
    expect(second).toMatchObject({
      id: "ep-2",
      description: "the hook, the skill, the brief",
      status: "open",
      revision: 0,
    });
  });

  it("lists open epics unless --all, in id order", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.epics.create, { actor, title: "one" });
    await t.mutation(api.epics.create, { actor, title: "two" });
    await t.run(async (ctx) => {
      const doc = await ctx.db
        .query("epics")
        .withIndex("by_public_id", (q) => q.eq("id", "ep-1"))
        .unique();
      await ctx.db.patch(doc!._id, { status: "closed" });
    });
    expect((await t.query(api.epics.list, {})).map((e) => e.id)).toEqual(["ep-2"]);
    expect((await t.query(api.epics.list, { all: true })).map((e) => e.id)).toEqual([
      "ep-1",
      "ep-2",
    ]);
  });

  it("counts tasks by status and open follow-ups beside them", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
    await t.mutation(api.epics.create, { actor, title: "Create to close" });
    for (const title of ["first", "second"])
      await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title });
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "check it on a device",
      type: "follow-up",
      followUpKind: "verify",
      parent: "cn-1",
    });
    await t.run(async (ctx) => {
      for (const id of ["cn-1", "cn-2"]) {
        const doc = await ctx.db
          .query("issues")
          .withIndex("by_public_id", (q) => q.eq("id", id))
          .unique();
        await ctx.db.patch(doc!._id, { status: "closed" });
      }
    });
    const [epic] = await t.query(api.epics.list, {});
    expect(epic!.counts).toEqual({
      open: 0,
      inProgress: 0,
      closed: 2,
      dropped: 0,
      followUps: 1,
    });
  });

  it("records one epic.create event carrying the new epic", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.epics.create, { actor, title: "Create to close" });
    const events = await t.run((ctx) => ctx.db.query("events").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "epic.create",
      actor,
      revision: 0,
      changes: { id: "ep-1", title: "Create to close" },
    });
    expect(events[0]!.changes.createdAt).toBeUndefined();
  });
});

describe("epics.health", () => {
  it("moves the in-progress issues to `moving`, with who holds them and since when", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seeded(2);
    const claimedAt = Date.now();
    await t.mutation(api.issues.claim, { actor, id: "cn-2" });
    expect(await healthOf(t)).toMatchObject({
      moving: [{ id: "cn-2", title: "work 2", claimedBy: actor, claimedAt }],
    });
  });

  it("has no stuck line until the silence passes three days, then names the worst", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seeded(2);
    at("2026-09-19T09:00:00Z");
    expect((await healthOf(t)).stuck).toBeUndefined();
    // cn-2 is touched today, so cn-1 is the one that has been silent longest.
    await t.mutation(api.issues.update, { actor, id: "cn-2", revision: 0, priority: 1 });
    at("2026-09-21T09:00:00Z");
    expect((await healthOf(t)).stuck).toMatchObject({ id: "cn-1", title: "work 1" });
  });

  it("counts neither a deferred issue nor a claimed one as stuck", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seeded(2);
    await t.mutation(api.issues.update, {
      actor,
      id: "cn-1",
      revision: 0,
      deferUntil: Date.now() + 30 * DAY,
    });
    await t.mutation(api.issues.claim, { actor, id: "cn-2" });
    at("2026-09-25T09:00:00Z");
    expect((await healthOf(t)).stuck).toBeUndefined();
  });

  it("names an unresolved blocker once however many issues it holds, and drops it resolved", async () => {
    const t = await seeded(2);
    await t.mutation(api.blockers.raise, {
      actor,
      issue: "cn-1",
      kind: "approval",
      owner: "balder",
      title: "the App Store agreement",
      whatResolves: "accept it in App Store Connect",
    });
    await t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" });
    expect((await healthOf(t)).waiting).toEqual([
      { id: "bl-1", title: "the App Store agreement", owner: "balder" },
    ]);
    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "accepted" });
    expect((await healthOf(t)).waiting).toEqual([]);
  });

  it("is what epics.list and show.get both carry", async () => {
    const t = await seeded(1);
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    const [epic] = await t.query(api.epics.list, {});
    expect(epic!.health.moving).toHaveLength(1);
    expect(await t.query(api.show.get, { id: "ep-1" })).toMatchObject({
      kind: "epic",
      health: { moving: [{ id: "cn-1" }], waiting: [] },
    });
  });
});

describe("epics.close", () => {
  it("refuses while a task is open, naming every one of them in reference form", async () => {
    const t = await seeded(2);
    await expect(
      t.mutation(api.epics.close, { actor, id: "ep-1", revision: 0 }),
    ).rejects.toMatchObject({
      data: {
        kind: "conflict",
        message: 'ep-1 "Create to close" has open work: cn-1 "work 1", cn-2 "work 2"',
      },
    });
    expect(await t.query(api.show.get, { id: "ep-1" })).toMatchObject({ status: "open" });
  });

  it("closes over an open follow-up, because residue is not open work", async () => {
    const t = await seeded(1);
    await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 0,
      verification: { command: "vp run verify", exitCode: 0, output: "pass" },
      followUp: { title: "confirm it on a device", kind: "verify" },
    });
    const { epic, dropped } = await t.mutation(api.epics.close, { actor, id: "ep-1", revision: 0 });
    expect(epic).toMatchObject({ id: "ep-1", status: "closed", revision: 1 });
    expect(epic.counts.followUps).toBe(1);
    expect(dropped).toEqual([]);
    const events = await t.run((ctx) => ctx.db.query("events").collect());
    expect(events.filter((e) => e.kind === "epic.close")).toMatchObject([{ actor, revision: 1 }]);
  });

  it("refuses the inbox, and a revision that has moved", async () => {
    const t = await seeded(1);
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-0", title: "stray" });
    await expect(
      t.mutation(api.epics.close, { actor, id: "ep-0", revision: 0 }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "ep-0 is the inbox; it does not close" },
    });
    await expect(
      t.mutation(api.epics.close, { actor, id: "ep-1", revision: 4 }),
    ).rejects.toMatchObject({ data: { kind: "stale", current: 0, yours: 4 } });
  });

  it("drops the epic and everything live in it, with the reason on each", async () => {
    const t = await seeded(2);
    await expect(
      t.mutation(api.epics.close, { actor, id: "ep-1", revision: 0, drop: true }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "dropping an epic needs --reason" },
    });

    const { epic, dropped } = await t.mutation(api.epics.close, {
      actor,
      id: "ep-1",
      revision: 0,
      drop: true,
      reason: "the feature is not shipping",
    });
    expect(epic).toMatchObject({
      id: "ep-1",
      status: "dropped",
      revision: 1,
      counts: { open: 0, dropped: 2 },
    });
    expect(dropped).toEqual([
      { id: "cn-1", title: "work 1" },
      { id: "cn-2", title: "work 2" },
    ]);
    for (const id of ["cn-1", "cn-2"])
      expect(await t.query(api.show.get, { id })).toMatchObject({
        status: "dropped",
        droppedReason: "the feature is not shipping",
      });
    const rows = await t.run((ctx) => ctx.db.query("events").collect());
    const kinds = rows.map((e) => e.kind);
    expect(kinds.filter((k) => k === "issue.drop")).toHaveLength(2);
    expect(kinds.filter((k) => k === "epic.drop")).toHaveLength(1);
    for (const e of rows.filter((e) => e.kind === "issue.drop"))
      expect(e.changes).toEqual({
        status: { from: "open", to: "dropped" },
        droppedReason: { to: "the feature is not shipping" },
      });
  });
});
