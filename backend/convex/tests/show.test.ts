// One id in, the thing and its neighbourhood out. The neighbourhood fields read empty
// until the edge and blocker verbs land, and that is the point of asserting them now:
// the shape is the contract `cn show` formats against.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const modules = import.meta.glob("../**/*.ts");

async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
  await t.mutation(api.epics.create, { actor, title: "Create to close" });
  await t.mutation(api.issues.create, {
    actor,
    project: "cn",
    epic: "ep-1",
    title: "schema, ids, revision, events, and the first verbs",
    priority: 0,
  });
  return t;
}

describe("show.get", () => {
  it("returns an issue with its journal and its neighbourhood", async () => {
    const t = await seeded();
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
      const doc = await ctx.db
        .query("issues")
        .withIndex("by_public_id", (q) => q.eq("id", "cn-1"))
        .unique();
      await ctx.db.insert("journal", {
        issueId: doc!._id,
        author: actor,
        kind: "finding",
        body: "the counter row is created on first use",
      });
    });
    const shown = await t.query(api.show.get, { id: "cn-1" });
    expect(shown).toMatchObject({
      kind: "issue",
      id: "cn-1",
      project: "cn",
      epic: { id: "ep-1", title: "Create to close" },
      blocks: [],
      blockedBy: [],
      related: [],
      waitingOn: [],
      followUps: [{ id: "cn-2", title: "check it on a device" }],
      journal: [
        {
          author: actor,
          kind: "finding",
          body: "the counter row is created on first use",
          at: expect.any(Number),
        },
      ],
    });
  });

  it("returns an epic with its open issues in list order", async () => {
    const t = await seeded();
    const shown = await t.query(api.show.get, { id: "ep-1" });
    expect(shown).toMatchObject({
      kind: "epic",
      id: "ep-1",
      counts: { open: 1 },
      issues: [
        {
          id: "cn-1",
          title: "schema, ids, revision, events, and the first verbs",
          status: "open",
          priority: 0,
        },
      ],
    });
  });

  it("returns a blocker with the issues it holds", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      const issue = await ctx.db
        .query("issues")
        .withIndex("by_public_id", (q) => q.eq("id", "cn-1"))
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
    });
    expect(await t.query(api.show.get, { id: "bl-1" })).toMatchObject({
      kind: "blocker",
      id: "bl-1",
      blockerKind: "approval",
      owner: "balder",
      status: "raised",
      issues: [{ id: "cn-1" }],
    });
    expect(await t.query(api.show.get, { id: "cn-1" })).toMatchObject({
      waitingOn: [{ id: "bl-1", title: "the App Store agreement" }],
    });
  });

  it("refuses an id nothing answers to", async () => {
    const t = await seeded();
    for (const id of ["cn-9", "ep-9", "bl-9"]) {
      await expect(t.query(api.show.get, { id })).rejects.toMatchObject({
        data: { kind: "not-found", message: `no such id ${id}` },
      });
    }
  });
});
