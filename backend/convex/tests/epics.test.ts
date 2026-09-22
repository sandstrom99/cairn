// Epics mint ep-1 upward, list open first, and carry counts computed on every read.
// The counts are the interesting part: follow-ups sit outside the denominator, so an
// epic's progress cannot be diluted by its own residue (docs/design.md §5). Beside them
// is health (§8): what is moving, what is stuck, what waits on a person — every line a
// fact with a query behind it, and none of them a percentage.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { DAY, STUCK_AFTER_MS } from "../lib/thresholds";
import {
  type Harness,
  actor,
  at,
  balder,
  closeIssue,
  eventsOf,
  fresh,
  raise,
  rawIssue,
  seed,
} from "./test.fixtures";

afterEach(() => vi.useRealTimers());

/** The seed with `n` open issues in ep-1, titled `work 1` upward. */
const work = (n: number) => seed({ issues: Array.from({ length: n }, (_, i) => `work ${i + 1}`) });

const healthOf = async (t: Harness, id = "ep-1") =>
  (await t.query(api.epics.health, { id })).health;

describe("epics", () => {
  it("mints ep-1 then ep-2 and starts every count at zero", async () => {
    const t = fresh();
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
    const t = fresh();
    await t.mutation(api.epics.create, { actor, title: "one" });
    await t.mutation(api.epics.create, { actor, title: "two" });
    await t.mutation(api.epics.close, { actor, id: "ep-1", revision: 0 });
    expect((await t.query(api.epics.list, {})).map((e) => e.id)).toEqual(["ep-2"]);
    expect((await t.query(api.epics.list, { all: true })).map((e) => e.id)).toEqual([
      "ep-1",
      "ep-2",
    ]);
  });

  it("counts tasks by status and open follow-ups beside them", async () => {
    const t = await seed({ issues: ["first", "second"] });
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "check it on a device",
      type: "follow-up",
      followUpKind: "verify",
      parent: "cn-1",
    });
    await closeIssue(t, "cn-1");
    await closeIssue(t, "cn-2");
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
    const t = fresh();
    await t.mutation(api.epics.create, { actor, title: "Create to close" });
    const events = await eventsOf(t);
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
    const t = await work(2);
    const claimedAt = Date.now();
    await t.mutation(api.issues.claim, { actor, id: "cn-2" });
    expect(await healthOf(t)).toMatchObject({
      moving: [{ id: "cn-2", title: "work 2", claimedBy: actor, claimedAt }],
    });
  });

  it("has no stuck line until the silence passes three days, then names the worst", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await work(2);
    at("2026-09-19T09:00:00Z");
    expect((await healthOf(t)).stuck).toBeUndefined();
    // cn-2 is touched today, so cn-1 is the one that has been silent longest.
    await t.mutation(api.issues.update, { actor, id: "cn-2", revision: 0, priority: 1 });
    at("2026-09-21T09:00:00Z");
    expect((await healthOf(t)).stuck).toMatchObject({ id: "cn-1", title: "work 1" });
  });

  it("takes `now` from the caller rather than the clock, for a subscriber that never re-asks", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await work(2);
    const { lastActivity } = await rawIssue(t, "cn-1");
    expect(
      (await t.query(api.epics.health, { id: "ep-1", now: lastActivity + STUCK_AFTER_MS })).health
        .stuck,
    ).toBeUndefined();
    const later = await t.query(api.epics.health, {
      id: "ep-1",
      now: lastActivity + STUCK_AFTER_MS + 1,
    });
    expect(later.health.stuck).toMatchObject({ id: "cn-1", title: "work 1" });
    expect(
      (await t.query(api.epics.list, { now: lastActivity + STUCK_AFTER_MS + 1 }))[0]!.health.stuck,
    ).toMatchObject({ id: "cn-1" });
    const shown = await t.query(api.show.get, {
      id: "ep-1",
      now: lastActivity + STUCK_AFTER_MS + 1,
    });
    if (shown.kind !== "epic") throw new Error("ep-1 is an epic");
    expect(shown.health.stuck).toMatchObject({ id: "cn-1" });
  });

  it("counts neither a deferred issue nor a claimed one as stuck", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await work(2);
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
    const t = await work(2);
    await raise(t, "cn-1");
    await t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" });
    expect((await healthOf(t)).waiting).toEqual([
      { id: "bl-1", title: "the App Store agreement", owner: "balder" },
    ]);
    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "accepted" });
    expect((await healthOf(t)).waiting).toEqual([]);
  });

  it("is what epics.list and show.get both carry", async () => {
    const t = await work(1);
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
    const t = await work(2);
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
    const t = await work(1);
    await closeIssue(t, "cn-1", 0, {
      followUp: { title: "confirm it on a device", kind: "verify" },
    });
    const { epic, dropped } = await t.mutation(api.epics.close, { actor, id: "ep-1", revision: 0 });
    expect(epic).toMatchObject({ id: "ep-1", status: "closed", revision: 1 });
    expect(epic.counts.followUps).toBe(1);
    expect(dropped).toEqual([]);
    expect(await eventsOf(t, "epic.close")).toMatchObject([{ actor, revision: 1 }]);
  });

  it("refuses the inbox, and a revision that has moved", async () => {
    const t = await work(1);
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
    const t = await work(2);
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
    const kinds = (await eventsOf(t)).map((e) => e.kind);
    expect(kinds.filter((k) => k === "issue.drop")).toHaveLength(2);
    expect(kinds.filter((k) => k === "epic.drop")).toHaveLength(1);
    for (const e of await eventsOf(t, "issue.drop"))
      expect(e.changes).toEqual({
        status: { from: "open", to: "dropped" },
        droppedReason: { to: "the feature is not shipping" },
      });
  });
});
