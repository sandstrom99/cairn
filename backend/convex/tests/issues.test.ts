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
