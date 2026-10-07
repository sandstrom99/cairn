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
  harbor,
  closeIssue,
  eventsOf,
  fresh,
  other,
  raise,
  rawIssue,
  seed,
} from "./test.fixtures";

afterEach(() => vi.useRealTimers());

/** The seed with `n` open issues in ep-1, titled `work 1` upward. */
const work = (n: number) => seed({ issues: Array.from({ length: n }, (_, i) => `work ${i + 1}`) });

/** An epic's health as `cn epic list` reads it, at `now` when the caller says. */
const healthOf = async (t: Harness, id = "ep-1", now?: number) => {
  const args = now === undefined ? { all: true } : { all: true, now };
  const epic = (await t.query(api.epics.list, args)).find((e) => e.id === id);
  if (!epic) throw new Error(`${id} is not listed`);
  return epic.health;
};

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

describe("epic health", () => {
  it("moves the in-progress issues to `moving`, with who holds them and since when", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await work(2);
    const claimedAt = Date.now();
    await t.mutation(api.issues.claim, { actor, id: "cn-2" });
    expect(await healthOf(t)).toMatchObject({
      moving: [{ id: "cn-2", title: "work 2", claimedBy: actor, claimedAt }],
    });
  });

  it("names an issue stuck only once its silence passes its priority's limit", async () => {
    for (const priority of [0, 1, 2]) {
      at("2026-09-17T09:00:00Z");
      const t = await seed({ issues: [{ title: "work 1", priority }] });
      const { lastActivity } = await rawIssue(t, "cn-1");
      const limit = STUCK_AFTER_MS[priority]!;
      expect((await healthOf(t, "ep-1", lastActivity + limit)).stuck).toEqual([]);
      expect((await healthOf(t, "ep-1", lastActivity + limit + 1)).stuck).toEqual([
        { id: "cn-1", title: "work 1", lastActivity },
      ]);
    }
  });

  it("never names a P3 or a P4 stuck, however long it sits", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seed({
      issues: [
        { title: "work 1", priority: 3 },
        { title: "work 2", priority: 4 },
      ],
    });
    const { lastActivity } = await rawIssue(t, "cn-1");
    expect((await healthOf(t, "ep-1", lastActivity + 365 * DAY)).stuck).toEqual([]);
  });

  it("orders the stuck issues by priority, then silent longest first", async () => {
    const t = await seed();
    const create = async (when: string, title: string, priority: number) => {
      at(when);
      await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title, priority });
    };
    await create("2026-09-01T09:00:00Z", "a P2, oldest", 2);
    await create("2026-09-02T09:00:00Z", "a P0", 0);
    await create("2026-09-03T09:00:00Z", "a P1", 1);
    await create("2026-09-04T09:00:00Z", "a younger P0", 0);
    await create("2026-09-05T09:00:00Z", "a younger P2", 2);
    await create("2026-09-06T09:00:00Z", "a P3", 3);
    at("2026-09-29T09:00:00Z");
    expect((await healthOf(t)).stuck.map((i) => i.id)).toEqual([
      "cn-2",
      "cn-4",
      "cn-3",
      "cn-1",
      "cn-5",
    ]);
  });

  it("names an issue a blocker holds as waiting, never stuck as well", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seed({
      issues: [
        { title: "work 1", priority: 0 },
        { title: "work 2", priority: 0 },
      ],
    });
    await raise(t, "cn-1");
    at("2026-09-25T09:00:00Z");
    const health = await healthOf(t);
    expect(health.stuck.map((i) => i.id)).toEqual(["cn-2"]);
    expect(health.waiting).toEqual([
      { id: "bl-1", title: "the App Store agreement", owner: "harbor" },
    ]);
  });

  it("takes `now` from the caller rather than the clock, for a subscriber that never re-asks", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await work(2);
    const { lastActivity } = await rawIssue(t, "cn-1");
    const limit = STUCK_AFTER_MS[2]!;
    expect((await healthOf(t, "ep-1", lastActivity + limit)).stuck).toEqual([]);
    expect((await healthOf(t, "ep-1", lastActivity + limit + 1)).stuck).toMatchObject([
      { id: "cn-1", title: "work 1" },
      { id: "cn-2", title: "work 2" },
    ]);
    const shown = await t.query(api.show.get, { id: "ep-1", now: lastActivity + limit + 1 });
    if (shown.kind !== "epic") throw new Error("ep-1 is an epic");
    expect(shown.health.stuck.map((i) => i.id)).toEqual(["cn-1", "cn-2"]);
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
    expect((await healthOf(t)).stuck).toEqual([]);
  });

  it("leaves an epic with nothing past its limit an empty stuck list", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await work(2);
    at("2026-09-23T09:00:00Z");
    expect((await healthOf(t)).stuck).toEqual([]);
  });

  it("names an unresolved blocker once however many issues it holds, and drops it resolved", async () => {
    const t = await work(2);
    await raise(t, "cn-1");
    await t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" });
    expect((await healthOf(t)).waiting).toEqual([
      { id: "bl-1", title: "the App Store agreement", owner: "harbor" },
    ]);
    await t.mutation(api.blockers.resolve, { actor: harbor, id: "bl-1", note: "accepted" });
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

  it("carries lastActivity as the newest write to the epic or an issue under it, and an edge moves nothing", async () => {
    at("2026-09-20T10:00:00Z");
    const t = await seed({ issues: ["work 1"] });
    at("2026-09-21T10:00:00Z");
    await t.mutation(api.journal.append, { actor, id: "cn-1", kind: "finding", body: "a finding" });
    at("2026-09-22T10:00:00Z");
    await t.mutation(api.epics.create, { actor, title: "two" });
    at("2026-09-23T10:00:00Z");
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "work 2" });
    at("2026-09-24T10:00:00Z");
    // cn-2 blocks cn-1, read from cn-1 as blocked by cn-2. An edge stamps no issue.
    await t.mutation(api.edges.add, { actor, from: "cn-2", to: "cn-1", type: "blocks" });
    const listed = await t.query(api.epics.list, { all: true });
    expect(listed.find((e) => e.id === "ep-1")!.lastActivity).toBe(
      Date.parse("2026-09-23T10:00:00Z"),
    );
    expect(listed.find((e) => e.id === "ep-2")!.lastActivity).toBe(
      Date.parse("2026-09-22T10:00:00Z"),
    );
  });
});

describe("epics.update", () => {
  it("stores a link given at create, stamped with who gave it", async () => {
    at("2026-09-28T09:00:00Z");
    const t = fresh();
    const created = await t.mutation(api.epics.create, {
      actor,
      title: "a plan",
      link: [{ url: " https://example.com/plan ", label: "plan" }],
    });
    expect(created.links).toEqual([
      { url: "https://example.com/plan", label: "plan", by: actor, at: Date.now() },
    ]);
    expect((await t.mutation(api.epics.create, { actor, title: "bare" })).links).toBeUndefined();
  });

  it("changes the title, the description and the links in one revision and one event", async () => {
    at("2026-09-28T09:00:00Z");
    const t = await work(1);
    const updated = await t.mutation(api.epics.update, {
      actor,
      id: "ep-1",
      revision: 0,
      title: "Create, then close",
      description: "the lifecycle",
      link: [{ url: "https://example.com/plan", label: "plan" }],
    });
    expect(updated).toMatchObject({
      id: "ep-1",
      title: "Create, then close",
      description: "the lifecycle",
      links: [{ url: "https://example.com/plan", label: "plan", by: actor, at: Date.now() }],
      revision: 1,
      counts: { open: 1 },
    });
    const events = await eventsOf(t, "epic.update");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor, revision: 1 });
    expect(events[0]!.changes).toEqual({
      title: { from: "Create to close", to: "Create, then close" },
      description: { from: undefined, to: "the lifecycle" },
      links: { from: [], to: [{ url: "https://example.com/plan", label: "plan" }] },
    });
  });

  it("rejects a stale revision with the epic.update since it", async () => {
    const t = await work(0);
    await t.mutation(api.epics.update, { actor, id: "ep-1", revision: 0, title: "one" });
    await expect(
      t.mutation(api.epics.update, { actor: other, id: "ep-1", revision: 0, title: "two" }),
    ).rejects.toMatchObject({
      data: {
        kind: "stale",
        id: "ep-1",
        yours: 0,
        current: 1,
        since: [{ revision: 1, actor, kind: "epic.update" }],
      },
    });
  });

  it("hands the epic back as it was on a bare re-link, and unlinks what it carries", async () => {
    const t = await work(0);
    await t.mutation(api.epics.update, {
      actor,
      id: "ep-1",
      revision: 0,
      link: [{ url: "https://example.com/plan", label: "plan" }],
    });
    const again = await t.mutation(api.epics.update, {
      actor,
      id: "ep-1",
      revision: 1,
      link: [{ url: "https://example.com/plan" }],
    });
    expect(again).toMatchObject({ revision: 1, links: [{ label: "plan" }] });
    expect(await eventsOf(t, "epic.update")).toHaveLength(1);

    const unlinked = await t.mutation(api.epics.update, {
      actor,
      id: "ep-1",
      revision: 1,
      unlink: ["https://example.com/plan"],
    });
    expect(unlinked).toMatchObject({ revision: 2 });
    expect(unlinked.links).toBeUndefined();
  });

  it("refuses a missing link, a bad URL, an empty title and an empty edit", async () => {
    const t = await work(0);
    const update = (fields: Record<string, unknown>) =>
      t.mutation(api.epics.update, { actor, id: "ep-1", revision: 0, ...fields });
    await expect(update({ unlink: ["https://example.com/missing"] })).rejects.toMatchObject({
      data: { kind: "invalid", message: "ep-1 has no link https://example.com/missing" },
    });
    await expect(update({ link: [{ url: "javascript:alert(1)" }] })).rejects.toMatchObject({
      data: { kind: "invalid", message: "javascript:alert(1) is not an http or https URL" },
    });
    await expect(update({ title: "  " })).rejects.toMatchObject({
      data: { kind: "invalid", message: "an epic needs a title" },
    });
    await expect(update({})).rejects.toMatchObject({
      data: { kind: "invalid", message: "nothing to update" },
    });
    expect(await eventsOf(t, "epic.update")).toEqual([]);
  });

  it("refuses the inbox and an epic that is no longer open", async () => {
    const t = await work(0);
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-0", title: "stray" });
    await expect(
      t.mutation(api.epics.update, { actor, id: "ep-0", revision: 0, title: "not the inbox" }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "ep-0 is the inbox; it does not change" },
    });
    await t.mutation(api.epics.close, { actor, id: "ep-1", revision: 0 });
    await expect(
      t.mutation(api.epics.update, { actor, id: "ep-1", revision: 1, title: "reopened" }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "ep-1 is closed; nothing about it changes now" },
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
