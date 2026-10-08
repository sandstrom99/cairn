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
    const first = await t.mutation(api.epics.create, {
      actor,
      title: "Create to close",
      doneWhen: "every issue in it is closed",
    });
    const second = await t.mutation(api.epics.create, {
      actor,
      title: "A session starts warm",
      doneWhen: "every issue in it is closed",
      description: "the hook, the skill, the brief",
    });
    expect(first.id).toBe("ep-1");
    expect(first.counts).toEqual({
      open: 0,
      inProgress: 0,
      closed: 0,
      dropped: 0,
      followUps: 0,
      recent: { days: 28, filed: 0, done: 0 },
    });
    expect(second).toMatchObject({
      id: "ep-2",
      description: "the hook, the skill, the brief",
      status: "open",
      revision: 0,
    });
  });

  it("lists open epics unless --all, in id order", async () => {
    const t = fresh();
    await t.mutation(api.epics.create, {
      actor,
      title: "one",
      doneWhen: "every issue in it is closed",
    });
    await t.mutation(api.epics.create, {
      actor,
      title: "two",
      doneWhen: "every issue in it is closed",
    });
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
      recent: { days: 28, filed: 2, done: 2 },
    });
  });

  it("records one epic.create event carrying the new epic", async () => {
    const t = fresh();
    await t.mutation(api.epics.create, {
      actor,
      title: "Create to close",
      doneWhen: "every issue in it is closed",
    });
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
    await t.mutation(api.epics.create, {
      actor,
      title: "two",
      doneWhen: "every issue in it is closed",
    });
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

describe("epics.create", () => {
  const NEEDS =
    "an outcome needs --done-when <when it is reached>; an intake that never closes is --stream";

  it("refuses an outcome without a done-when and a stream with one, minting nothing", async () => {
    const t = fresh();
    for (const doneWhen of [undefined, "   "])
      await expect(
        t.mutation(api.epics.create, { actor, title: "Ship invite links", doneWhen }),
      ).rejects.toMatchObject({ data: { kind: "invalid", message: NEEDS } });
    await expect(
      t.mutation(api.epics.create, {
        actor,
        title: "Scout findings",
        type: "stream",
        doneWhen: "never",
      }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "a stream never closes, so it has no --done-when" },
    });
    expect(await eventsOf(t)).toEqual([]);
    const first = await t.mutation(api.epics.create, {
      actor,
      title: "Ship invite links",
      doneWhen: "x",
    });
    expect(first.id).toBe("ep-1");
  });

  it("makes an outcome with its done-when trimmed, and a stream with none", async () => {
    const t = fresh();
    const outcome = await t.mutation(api.epics.create, {
      actor,
      title: "Ship invite links",
      doneWhen: "  an invite link opens the app on both platforms ",
    });
    expect(outcome).toMatchObject({
      type: "outcome",
      doneWhen: "an invite link opens the app on both platforms",
    });
    const stream = await t.mutation(api.epics.create, {
      actor,
      title: "Scout findings, each fixed or decided",
      type: "stream",
    });
    expect(stream).toMatchObject({ id: "ep-2", type: "stream" });
    expect(stream.doneWhen).toBeUndefined();
  });

  it("counts the tasks filed and done in the last 28 days beside the all-time counts", async () => {
    at("2026-09-01T09:00:00Z");
    const t = await seed({ issues: ["old"] });
    at("2026-09-29T09:00:00Z");
    await closeIssue(t, "cn-1");
    at("2026-09-30T09:00:00Z");
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "new" });
    const [epic] = await t.query(api.epics.list, {});
    expect(epic!.counts).toMatchObject({
      open: 1,
      closed: 1,
      recent: { days: 28, filed: 1, done: 1 },
    });

    // The window is 28 UTC days, today included, so it rolls at midnight and not by the hour.
    const recentAt = async (when: string) =>
      (await t.query(api.epics.list, { now: Date.parse(when) }))[0]!.counts.recent;
    expect(await recentAt("2026-10-26T23:59:00Z")).toEqual({ days: 28, filed: 1, done: 1 });
    expect(await recentAt("2026-10-27T00:00:00Z")).toEqual({ days: 28, filed: 1, done: 0 });
  });

  it("reads an epic row from before the type field by its id: the inbox a stream", async () => {
    const t = fresh();
    await t.run((ctx) =>
      ctx.db.insert("epics", { id: "ep-0", title: "Inbox", status: "open", revision: 0 }),
    );
    expect(await t.query(api.show.get, { id: "ep-0" })).toMatchObject({ type: "stream" });
    expect((await t.query(api.review.get, { id: "ep-0" })).needsDoneWhen).toBe(false);
  });
});

describe("epics.update", () => {
  it("stores a link given at create, stamped with who gave it", async () => {
    at("2026-09-28T09:00:00Z");
    const t = fresh();
    const created = await t.mutation(api.epics.create, {
      actor,
      title: "a plan",
      doneWhen: "every issue in it is closed",
      link: [{ url: " https://example.com/plan ", label: "plan" }],
    });
    expect(created.links).toEqual([
      { url: "https://example.com/plan", label: "plan", by: actor, at: Date.now() },
    ]);
    const bare = await t.mutation(api.epics.create, {
      actor,
      title: "bare",
      doneWhen: "every issue in it is closed",
    });
    expect(bare.links).toBeUndefined();
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

  it("changes the done-when, recording it from and to", async () => {
    const t = await work(0);
    const updated = await t.mutation(api.epics.update, {
      actor,
      id: "ep-1",
      revision: 0,
      doneWhen: " both twins are closed ",
    });
    expect(updated).toMatchObject({ doneWhen: "both twins are closed", revision: 1 });
    expect((await eventsOf(t, "epic.update"))[0]!.changes).toEqual({
      doneWhen: { from: "every issue in it is closed", to: "both twins are closed" },
    });
    await expect(
      t.mutation(api.epics.update, { actor, id: "ep-1", revision: 1, doneWhen: " " }),
    ).rejects.toMatchObject({
      data: {
        kind: "invalid",
        message:
          "an outcome needs --done-when <when it is reached>; an intake that never closes is --stream",
      },
    });
  });

  it("turns an outcome into a stream, clearing its done-when, and back only with one", async () => {
    const t = await work(0);
    const update = (revision: number, fields: Record<string, unknown>) =>
      t.mutation(api.epics.update, { actor, id: "ep-1", revision, ...fields });

    const stream = await update(0, { type: "stream" });
    expect(stream).toMatchObject({ type: "stream", revision: 1 });
    expect(stream.doneWhen).toBeUndefined();
    expect((await eventsOf(t, "epic.update"))[0]!.changes).toEqual({
      type: { from: "outcome", to: "stream" },
      doneWhen: { from: "every issue in it is closed", to: undefined },
    });

    await expect(update(1, { doneWhen: "x" })).rejects.toMatchObject({
      data: {
        kind: "invalid",
        message: "a stream has no --done-when; --outcome --done-when makes ep-1 an outcome",
      },
    });
    await expect(update(1, { type: "outcome" })).rejects.toMatchObject({
      data: {
        kind: "invalid",
        message: "ep-1 becomes an outcome with --done-when <when it is reached>",
      },
    });
    await expect(update(1, { type: "stream" })).rejects.toMatchObject({
      data: { kind: "invalid", message: "nothing to update" },
    });

    const back = await update(1, { type: "outcome", doneWhen: "the plan is read" });
    expect(back).toMatchObject({ type: "outcome", doneWhen: "the plan is read", revision: 2 });
    expect((await eventsOf(t, "epic.update"))[1]!.changes).toEqual({
      doneWhen: { from: undefined, to: "the plan is read" },
      type: { from: "stream", to: "outcome" },
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
        message:
          'ep-1 "Create to close" has open work: cn-1 "work 1", cn-2 "work 2"; --carry-to <ep-id> moves it into another epic',
      },
    });
    expect(await t.query(api.show.get, { id: "ep-1" })).toMatchObject({ status: "open" });
  });

  it("closes over an open follow-up, because residue is not open work", async () => {
    const t = await work(1);
    await closeIssue(t, "cn-1", 0, {
      followUp: { title: "confirm it on a device", kind: "verify" },
    });
    const { epic, dropped, carried } = await t.mutation(api.epics.close, {
      actor,
      id: "ep-1",
      revision: 0,
    });
    expect(epic).toMatchObject({ id: "ep-1", status: "closed", revision: 1 });
    expect(epic.counts.followUps).toBe(1);
    expect(dropped).toEqual([]);
    expect(carried).toEqual([]);
    expect(await eventsOf(t, "epic.close")).toMatchObject([{ actor, revision: 1 }]);
  });

  it("refuses a stream, which never closes, and drops one with a reason", async () => {
    const t = fresh();
    await t.mutation(api.epics.create, { actor, title: "Scout findings", type: "stream" });
    await expect(
      t.mutation(api.epics.close, { actor, id: "ep-1", revision: 0 }),
    ).rejects.toMatchObject({
      data: {
        kind: "invalid",
        message: "ep-1 is a stream; it never closes, and --drop --reason retires it",
      },
    });
    const { epic } = await t.mutation(api.epics.close, {
      actor,
      id: "ep-1",
      revision: 0,
      drop: true,
      reason: "the scout runs elsewhere now",
    });
    expect(epic).toMatchObject({ status: "dropped", type: "stream" });
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

  /**
   * ep-1 with cn-1 open, cn-2 claimed by another agent, cn-3 closed and its follow-up cn-4
   * open, and ep-2 open beside it.
   */
  const withNextDoor = async () => {
    const t = await work(3);
    await closeIssue(t, "cn-3", 0, {
      followUp: { title: "confirm it on a device", kind: "verify" },
    });
    await t.mutation(api.issues.claim, { actor: other, id: "cn-2" });
    await t.mutation(api.epics.create, { actor, title: "Next door", doneWhen: "the rest is in" });
    return t;
  };

  it("carries every open and in-progress task into another epic and closes, in one write", async () => {
    const t = await withNextDoor();
    const { epic, dropped, carried, carriedTo } = await t.mutation(api.epics.close, {
      actor,
      id: "ep-1",
      revision: 0,
      carryTo: "ep-2",
    });
    expect(epic).toMatchObject({ id: "ep-1", status: "closed", revision: 1 });
    expect(epic.counts).toMatchObject({ open: 0, inProgress: 0, followUps: 1 });
    expect(dropped).toEqual([]);
    expect(carried).toEqual([
      { id: "cn-1", title: "work 1" },
      { id: "cn-2", title: "work 2" },
    ]);
    expect(carriedTo).toEqual({ id: "ep-2", title: "Next door" });

    const into = { id: "ep-2", title: "Next door" };
    expect(await t.query(api.show.get, { id: "cn-1" })).toMatchObject({
      status: "open",
      epic: into,
    });
    expect(await t.query(api.show.get, { id: "cn-2" })).toMatchObject({
      status: "in_progress",
      epic: into,
    });
    expect(await rawIssue(t, "cn-2")).toMatchObject({ claimedBy: other });
    // The follow-up stays beside its parent, as on any close.
    expect(await t.query(api.show.get, { id: "cn-4" })).toMatchObject({
      type: "follow-up",
      status: "open",
      epic: { id: "ep-1" },
    });

    const moves = (await eventsOf(t, "issue.update")).map((e) => e.changes);
    expect(moves).toEqual([
      { epic: { from: "ep-1", to: "ep-2" } },
      { epic: { from: "ep-1", to: "ep-2" } },
    ]);
    const fields = {
      "cn-1": { from: "ep-1", to: "ep-2" },
      "cn-2": { from: "ep-1", to: "ep-2" },
    };
    expect((await eventsOf(t, "epic.close")).map((e) => e.changes)).toEqual([
      { status: { from: "open", to: "closed" }, ...fields },
    ]);
    expect(await t.query(api.show.get, { id: "ep-2" })).toMatchObject({ revision: 1 });
    expect(await eventsOf(t, "epic.update")).toMatchObject([
      { kind: "epic.update", actor, revision: 1, changes: fields },
    ]);
  });

  it("refuses a carry to itself, the inbox, a closed epic or an unknown one, and beside a drop", async () => {
    const t = await withNextDoor();
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-0", title: "stray" });
    await t.mutation(api.epics.create, { actor, title: "Done already", doneWhen: "now" });
    await t.mutation(api.epics.close, { actor, id: "ep-3", revision: 0 });
    const refusals: [Record<string, unknown>, Record<string, string>][] = [
      [{ carryTo: "ep-1" }, { kind: "invalid", message: "ep-1 cannot carry its work to itself" }],
      [
        { carryTo: "ep-0" },
        {
          kind: "invalid",
          message: "ep-0 is the inbox; work is carried into an epic, not back to it",
        },
      ],
      [
        { carryTo: "ep-3" },
        { kind: "invalid", message: "epic ep-3 is closed; an issue goes in an open epic" },
      ],
      [{ carryTo: "ep-99" }, { kind: "not-found", message: "no such id ep-99" }],
      [
        { carryTo: "ep-2", drop: true, reason: "not shipping" },
        {
          kind: "invalid",
          message: "--carry-to goes with a close, not --drop; a drop takes the work with it",
        },
      ],
    ];
    for (const [extra, data] of refusals)
      await expect(
        t.mutation(api.epics.close, { actor, id: "ep-1", revision: 0, ...extra }),
      ).rejects.toMatchObject({ data });
    expect(await t.query(api.show.get, { id: "ep-1" })).toMatchObject({
      status: "open",
      revision: 0,
    });
    expect(await eventsOf(t, "issue.update")).toEqual([]);
  });

  it("closes with nothing carried when no task is live, and writes nothing on the target", async () => {
    const t = await work(1);
    await closeIssue(t, "cn-1");
    await t.mutation(api.epics.create, { actor, title: "Next door", doneWhen: "the rest is in" });
    const { epic, carried, carriedTo } = await t.mutation(api.epics.close, {
      actor,
      id: "ep-1",
      revision: 0,
      carryTo: "ep-2",
    });
    expect(epic).toMatchObject({ status: "closed", revision: 1 });
    expect(carried).toEqual([]);
    expect(carriedTo).toEqual({ id: "ep-2", title: "Next door" });
    expect(await t.query(api.show.get, { id: "ep-2" })).toMatchObject({ revision: 0 });
    expect(await eventsOf(t, "epic.update")).toEqual([]);
  });
});
