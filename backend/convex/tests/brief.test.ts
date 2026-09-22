// The brief is the one query a session starts with (design §8), so every number in it is
// a number somebody acts on: a ready count that includes blocked work sends an agent at
// something it cannot move, and a follow-ups line that hides what it left out reads as
// "there is nothing". Follow-ups are the one place `can[]` filters rather than marks, and
// the last test here is the other half of that rule — `ready.list` still shows the row.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { RECONCILE } from "../lib/actor";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const other = { name: "mac/claude", kind: "agent" } as const;
const human = { name: "wsl/balder", kind: "human" } as const;
const modules = import.meta.glob("../**/*.ts");

/**
 * Three tasks at P1, P0 and P2 (cn-1 to cn-3), a fourth claimed by another machine
 * (cn-4), two follow-ups under it — one needing `ios` (cn-5), one needing nothing (cn-6)
 * — and two blockers: bl-1 on the P2 task from this session, bl-2 on the P1 task from
 * reconcile. So one task alone is ready, and one follow-up alone is coverable.
 */
async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
  await t.mutation(api.epics.create, { actor, title: "Create to close" });
  const task = (title: string, priority: number) =>
    t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title, priority });
  await task("a", 1);
  await task("b", 0);
  await task("c", 2);
  await task("d", 1);
  await t.mutation(api.issues.claim, { actor: other, id: "cn-4" });
  for (const requires of [["ios"], []])
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: `confirm ${requires.join(",") || "it"}`,
      type: "follow-up",
      followUpKind: "verify",
      parent: "cn-4",
      requires,
    });
  await t.mutation(api.blockers.raise, {
    actor,
    issue: "cn-3",
    kind: "decision",
    owner: "balder",
    title: "which retry policy",
    whatResolves: "balder picks one",
  });
  await t.mutation(api.blockers.raise, {
    actor: RECONCILE,
    issue: "cn-1",
    kind: "approval",
    owner: "balder",
    title: "ep-1 has been silent for 9d",
    whatResolves: "balder says what happens to it",
  });
  return t;
}

describe("brief.get", () => {
  it("counts and heads what a session can actually act on", async () => {
    const t = await seeded();
    const brief = await t.query(api.brief.get, {});

    // cn-1 and cn-3 are held by blockers; cn-4 is claimed; the follow-ups are not tasks.
    expect(brief.ready.count).toBe(1);
    expect(brief.ready.top).toEqual([{ id: "cn-2", title: "b", priority: 0, cannot: [] }]);

    expect(brief.inProgress).toEqual([
      { id: "cn-4", title: "d", claimedBy: other, claimedAt: expect.any(Number), mine: false },
    ]);

    // Two are ready; one needs `ios`, which a session that declared nothing does not have.
    expect(brief.followUps.count).toBe(2);
    expect(brief.followUps.covered).toEqual([
      { id: "cn-6", title: "confirm it", followUpKind: "verify", requires: [] },
    ]);

    expect(brief.waiting).toBe(2);
    expect(brief.flagged).toBe(1);
  });

  it("covers a follow-up the moment the session says it can do it", async () => {
    const t = await seeded();
    const brief = await t.query(api.brief.get, { can: ["ios"] });
    expect(brief.followUps.covered.map((f) => f.id)).toEqual(["cn-5", "cn-6"]);
    expect(brief.followUps.count).toBe(2);
  });

  it("frees what a resolved blocker held, and unflags it", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.resolve, { actor: human, id: "bl-2", note: "it ships as is" });

    const brief = await t.query(api.brief.get, {});
    expect(brief.ready.count).toBe(2);
    expect(brief.ready.top.map((i) => i.id)).toEqual(["cn-2", "cn-1"]);
    expect(brief.waiting).toBe(1);
    expect(brief.flagged).toBe(0);
  });

  it("heads three and counts all of them", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
    await t.mutation(api.epics.create, { actor, title: "Create to close" });
    for (const title of ["a", "b", "c", "d"])
      await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title });

    const brief = await t.query(api.brief.get, {});
    expect(brief.ready.count).toBe(4);
    expect(brief.ready.top.map((i) => i.id)).toEqual(["cn-1", "cn-2", "cn-3"]);
  });

  it("takes `now` from the caller rather than the clock, for a subscriber that never re-asks", async () => {
    const t = await seeded();
    // cn-2 is already ready; a second task, deferred, joins it once the defer date passes.
    const deferUntil = Date.now() + 24 * 60 * 60 * 1000;
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "e" });
    await t.mutation(api.issues.update, { actor, id: "cn-7", revision: 0, deferUntil });
    expect((await t.query(api.brief.get, { now: deferUntil - 1 })).ready.count).toBe(1);
    expect((await t.query(api.brief.get, { now: deferUntil })).ready.count).toBe(2);
  });

  it("marks a claim as this session's on the same test the claim is idempotent on", async () => {
    const t = await seeded();
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
    const t = await seeded();
    const claimedAt = (await t.query(api.brief.get, {})).inProgress[0]!.claimedAt!;
    const day = 24 * 60 * 60 * 1000;

    const fresh = (await t.query(api.brief.get, { now: claimedAt + day })).inProgress[0]!;
    expect(fresh.silentSince).toBeUndefined();

    const silent = (await t.query(api.brief.get, { now: claimedAt + day + 1 })).inProgress[0]!;
    expect(silent).toMatchObject({ id: "cn-4", silentSince: claimedAt });

    // A journal entry is activity: a day after it, the same claim is not silent.
    await t.mutation(api.journal.append, {
      actor: other,
      id: "cn-4",
      kind: "finding",
      body: "here",
    });
    const { lastActivity } = await t.run(
      async (ctx) =>
        (await ctx.db
          .query("issues")
          .withIndex("by_public_id", (q) => q.eq("id", "cn-4"))
          .unique())!,
    );
    expect(lastActivity).toBeGreaterThanOrEqual(claimedAt);
    const heard = (await t.query(api.brief.get, { now: lastActivity + day })).inProgress[0]!;
    expect(heard.silentSince).toBeUndefined();
    expect(heard.claimedBy).toEqual(other);
  });

  it("leaves the row the brief filtered in ready, marked", async () => {
    const t = await seeded();
    const rows = await t.query(api.ready.list, {});
    const ios = rows.find((i) => i.id === "cn-5");
    expect(ios?.cannot).toEqual(["ios"]);
  });
});
