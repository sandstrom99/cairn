// Epics mint ep-1 upward, list open first, and carry counts computed on every read.
// The counts are the interesting part: follow-ups sit outside the denominator, so an
// epic's progress cannot be diluted by its own residue (docs/design.md §5).
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const modules = import.meta.glob("../**/*.ts");

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
