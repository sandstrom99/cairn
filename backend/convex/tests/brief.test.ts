// The brief is the one query a session starts with (design §8), so every number in it is
// a number somebody acts on: a ready count that includes blocked work sends an agent at
// something it cannot move.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { DAY, HOUR } from "../lib/thresholds";
import { actor, at, balder, fresh, other, raise, rawIssue, seed } from "./test.fixtures";

afterEach(() => vi.useRealTimers());

/**
 * Three tasks at P1, P0 and P2 (cn-1 to cn-3), a fourth claimed by another machine
 * (cn-4), two follow-ups under it (cn-5, cn-6), and two blockers: bl-1 on the P2 task,
 * bl-2 on the P1 task. So one task alone is ready, and both follow-ups are.
 */
async function worklist() {
  const t = await seed({
    issues: [
      { title: "a", priority: 1 },
      { title: "b", priority: 0 },
      { title: "c", priority: 2 },
      { title: "d", priority: 1 },
    ],
  });
  await t.mutation(api.issues.claim, { actor: other, id: "cn-4" });
  for (const title of ["confirm on a phone", "confirm it"])
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title,
      type: "follow-up",
      followUpKind: "verify",
      parent: "cn-4",
    });
  await raise(t, "cn-3", {
    kind: "decision",
    title: "which retry policy",
    whatResolves: "balder picks one",
  });
  await raise(t, "cn-1", {
    title: "ep-1 has been silent for 9d",
    whatResolves: "balder says what happens to it",
  });
  return t;
}

describe("brief.get", () => {
  it("counts and heads what a session can actually act on", async () => {
    const t = await worklist();
    const brief = await t.query(api.brief.get, {});

    // cn-1 and cn-3 are held by blockers; cn-4 is claimed; the follow-ups are not tasks.
    expect(brief.ready.count).toBe(1);
    expect(brief.ready.top).toEqual([{ id: "cn-2", title: "b", priority: 0 }]);

    expect(brief.inProgress).toEqual([
      { id: "cn-4", title: "d", claimedBy: other, claimedAt: expect.any(Number), mine: false },
    ]);

    // Both are ready, and a follow-up that says it needs a phone is listed like any other.
    expect(brief.followUps).toEqual([
      { id: "cn-5", title: "confirm on a phone", followUpKind: "verify" },
      { id: "cn-6", title: "confirm it", followUpKind: "verify" },
    ]);

    expect(brief.waiting).toBe(2);
  });

  it("names every project by slug, in slug order", async () => {
    const t = fresh();
    expect((await t.query(api.brief.get, {})).projects).toEqual([]);

    await t.mutation(api.projects.create, { actor, slug: "tools", name: "the tools" });
    await t.mutation(api.projects.create, { actor, slug: "app", name: "the app" });
    expect((await t.query(api.brief.get, {})).projects).toEqual(["app", "tools"]);
  });

  it("frees what a resolved blocker held", async () => {
    const t = await worklist();
    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-2", note: "it ships as is" });

    const brief = await t.query(api.brief.get, {});
    expect(brief.ready.count).toBe(2);
    expect(brief.ready.top.map((i) => i.id)).toEqual(["cn-2", "cn-1"]);
    expect(brief.waiting).toBe(1);
  });

  it("heads three and counts all of them", async () => {
    const t = await seed({ issues: ["a", "b", "c", "d"] });
    const brief = await t.query(api.brief.get, {});
    expect(brief.ready.count).toBe(4);
    expect(brief.ready.top.map((i) => i.id)).toEqual(["cn-1", "cn-2", "cn-3"]);
  });

  it("takes `now` from the caller rather than the clock, for a subscriber that never re-asks", async () => {
    const t = await worklist();
    // cn-2 is already ready; a second task, deferred, joins it once the defer date passes.
    const deferUntil = Date.now() + DAY;
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "e" });
    await t.mutation(api.issues.update, { actor, id: "cn-7", revision: 0, deferUntil });
    expect((await t.query(api.brief.get, { now: deferUntil - 1 })).ready.count).toBe(1);
    expect((await t.query(api.brief.get, { now: deferUntil })).ready.count).toBe(2);
  });

  it("marks a claim as this session's on the same test the claim is idempotent on", async () => {
    const t = await worklist();
    const one = { ...actor, session: "s-1" };
    const two = { ...actor, session: "s-2" };
    await t.mutation(api.issues.claim, { actor: one, id: "cn-2" });

    const mine = (await t.query(api.brief.get, { actor: one })).inProgress;
    expect(mine.map((i) => [i.id, i.mine])).toEqual([
      ["cn-4", false],
      ["cn-2", true],
    ]);
    // The same name from another session, or from no session, is not the holder.
    expect((await t.query(api.brief.get, { actor: two })).inProgress.map((i) => i.mine)).toEqual([
      false,
      false,
    ]);
    expect((await t.query(api.brief.get, { actor })).inProgress.map((i) => i.mine)).toEqual([
      false,
      false,
    ]);
    // A caller with no actor at all, the page, is nobody's session.
    expect((await t.query(api.brief.get, {})).inProgress.map((i) => i.mine)).toEqual([
      false,
      false,
    ]);
  });

  it("shows a claim silent past the threshold as silent since its last activity, and releases nothing", async () => {
    const t = await worklist();
    const claimedAt = (await t.query(api.brief.get, {})).inProgress[0]!.claimedAt!;

    const fresh = (await t.query(api.brief.get, { now: claimedAt + DAY })).inProgress[0]!;
    expect(fresh.silentSince).toBeUndefined();

    const silent = (await t.query(api.brief.get, { now: claimedAt + DAY + 1 })).inProgress[0]!;
    expect(silent).toMatchObject({ id: "cn-4", silentSince: claimedAt });

    // A journal entry is activity: a day after it, the same claim is not silent.
    await t.mutation(api.journal.append, {
      actor: other,
      id: "cn-4",
      kind: "finding",
      body: "here",
    });
    const { lastActivity } = await rawIssue(t, "cn-4");
    expect(lastActivity).toBeGreaterThanOrEqual(claimedAt);
    const heard = (await t.query(api.brief.get, { now: lastActivity + DAY })).inProgress[0]!;
    expect(heard.silentSince).toBeUndefined();
    expect(heard.claimedBy).toEqual(other);
  });

  it("says when a claim last had anything journaled, and marks it quiet past the threshold", async () => {
    const t = await worklist();
    const one = { ...actor, session: "s-1" };
    const held = async (now?: number) =>
      (await t.query(api.brief.get, { actor: one, now })).inProgress.find((i) => i.id === "cn-2")!;

    await t.mutation(api.issues.claim, { actor: one, id: "cn-2" });
    const claimedAt = (await held()).claimedAt!;
    // Nothing journaled yet: quiet counts from the claim, and only once the hour is past.
    expect(await held(claimedAt + HOUR)).not.toHaveProperty("unjournaledSince");
    const quiet = await held(claimedAt + HOUR + 1);
    expect(quiet).toMatchObject({ mine: true, unjournaledSince: claimedAt });
    expect(quiet).not.toHaveProperty("lastJournal");

    // An entry moves the mark to itself, whoever wrote it.
    const entry = await t.mutation(api.journal.append, {
      actor: other,
      id: "cn-2",
      kind: "finding",
      body: "here",
    });
    const heard = await held(entry.at + HOUR);
    expect(heard).toMatchObject({ lastJournal: entry.at });
    expect(heard).not.toHaveProperty("unjournaledSince");
    expect(await held(entry.at + HOUR + 1)).toMatchObject({
      lastJournal: entry.at,
      unjournaledSince: entry.at,
    });
  });

  it("counts quiet from the claim when the only entries are older than it", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await worklist();
    const one = { ...actor, session: "s-1" };
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "e" });
    const entry = await t.mutation(api.journal.append, {
      actor,
      id: "cn-7",
      kind: "finding",
      body: "before the claim",
    });
    // A second on, so the claim is younger than the entry by the clock and not by luck.
    at("2026-09-17T09:00:01Z");
    await t.mutation(api.issues.claim, { actor: one, id: "cn-7" });
    const row = async (now: number) =>
      (await t.query(api.brief.get, { actor: one, now })).inProgress.find((i) => i.id === "cn-7")!;
    const claimedAt = (await row(Date.now())).claimedAt!;
    expect(claimedAt).toBeGreaterThan(entry.at);
    // An hour past the entry is not an hour past the claim.
    expect(await row(claimedAt + HOUR)).not.toHaveProperty("unjournaledSince");
    expect(await row(claimedAt + HOUR + 1)).toMatchObject({
      lastJournal: entry.at,
      unjournaledSince: claimedAt,
    });
  });
});
