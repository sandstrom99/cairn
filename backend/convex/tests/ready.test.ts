// Readiness is design §4, and every clause of it is a way work goes dark if it is wrong:
// a blocker that closes and nothing notices, a defer date that never wakes, a capability
// that hides a row instead of marking it. One test per clause, and one for the order.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const modules = import.meta.glob("../**/*.ts");

const DAY = 24 * 60 * 60 * 1000;

/** A deployment with one epic and two open issues, cn-1 and cn-2. */
async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
  await t.mutation(api.epics.create, { actor, title: "Create to close" });
  await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "a" });
  await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "b" });
  return t;
}

const ids = async (t: Awaited<ReturnType<typeof seeded>>, can?: string[]) =>
  (await t.query(api.ready.list, can === undefined ? {} : { can })).map((i) => i.id);

describe("ready.list", () => {
  it("drops an issue with an open blocks edge into it, and takes it back the moment the blocker closes", async () => {
    const t = await seeded();
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    expect(await ids(t)).toEqual(["cn-1"]);

    await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 0,
      verification: { command: "vp run verify", exitCode: 0, output: "all green" },
    });
    // Nothing in between: no recompute, no sweep, no second call.
    expect(await ids(t)).toEqual(["cn-2"]);
  });

  it("is still blocked by an in-progress blocker and not by a dropped one", async () => {
    const t = await seeded();
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(await ids(t)).toEqual([]);

    await t.mutation(api.issues.drop, { actor, id: "cn-1", revision: 1, reason: "not doing it" });
    expect(await ids(t)).toEqual(["cn-2"]);
  });

  it("ignores the edge types that are only context", async () => {
    const t = await seeded();
    for (const type of ["related", "discovered-from", "duplicates", "supersedes"] as const)
      await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type });
    expect(await ids(t)).toEqual(["cn-1", "cn-2"]);
  });

  it("drops an issue with an unresolved human blocker, and takes it back when it resolves", async () => {
    const t = await seeded();
    // The blocker verbs land in a later slice; the rows are what ready reads.
    const blockerId = await t.run(async (ctx) => {
      const issue = await ctx.db
        .query("issues")
        .withIndex("by_public_id", (q) => q.eq("id", "cn-2"))
        .unique();
      const blockerId = await ctx.db.insert("blockers", {
        id: "bl-1",
        kind: "approval",
        owner: "balder",
        title: "the App Store agreement",
        whatResolves: "accept it in App Store Connect",
        status: "raised",
        raisedBy: actor,
        revision: 0,
      });
      await ctx.db.insert("blockerLinks", { blockerId, issueId: issue!._id });
      return blockerId;
    });
    expect(await ids(t)).toEqual(["cn-1"]);

    await t.run((ctx) => ctx.db.patch(blockerId, { status: "resolved" }));
    expect(await ids(t)).toEqual(["cn-1", "cn-2"]);
  });

  it("hides a deferred issue from ready and from nothing else", async () => {
    const t = await seeded();
    await t.mutation(api.issues.update, {
      actor,
      id: "cn-2",
      revision: 0,
      deferUntil: Date.now() + DAY,
    });
    expect(await ids(t)).toEqual(["cn-1"]);
    expect((await t.query(api.issues.list, {})).map((i) => i.id)).toEqual(["cn-1", "cn-2"]);

    await t.mutation(api.issues.update, {
      actor,
      id: "cn-2",
      revision: 1,
      deferUntil: Date.now() - DAY,
    });
    expect(await ids(t)).toEqual(["cn-1", "cn-2"]);
  });

  it("leaves a claimed issue out: in progress is somebody's work, not ready work", async () => {
    const t = await seeded();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(await ids(t)).toEqual(["cn-2"]);
  });

  it("marks what this session cannot do and hides none of it", async () => {
    const t = await seeded();
    await t.mutation(api.issues.update, { actor, id: "cn-1", revision: 0, requires: ["ios"] });
    const cannot = async (can?: string[]) =>
      (await t.query(api.ready.list, can === undefined ? {} : { can })).map((i) => i.cannot);

    expect(await cannot(["web"])).toEqual([["ios"], []]);
    expect(await cannot(["ios", "web"])).toEqual([[], []]);
    expect(await cannot()).toEqual([["ios"], []]);
    expect(await ids(t, ["web"])).toEqual(["cn-1", "cn-2"]);
  });

  it("is ordered by priority, then age", async () => {
    const t = await seeded();
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "later but urgent",
      priority: 0,
    });
    // cn-1 and cn-2 are both P2 and in creation order; cn-3 is P0 and created last.
    expect(await ids(t)).toEqual(["cn-3", "cn-1", "cn-2"]);
  });
});
