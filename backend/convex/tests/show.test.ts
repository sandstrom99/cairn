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
      discoveredFrom: [],
      duplicates: [],
      supersedes: [],
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

  it("puts each edge type in its own list, and reads related both ways", async () => {
    const t = await seeded();
    for (const title of ["the lifecycle", "the graph", "the brief", "a duplicate"])
      await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title });
    await t.mutation(api.edges.add, { actor, from: "cn-2", to: "cn-1", type: "blocks" });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-3", type: "blocks" });
    // related is symmetric, so cn-1 sees it whichever end wrote it.
    await t.mutation(api.edges.add, { actor, from: "cn-4", to: "cn-1", type: "related" });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "discovered-from" });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-5", type: "duplicates" });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-4", type: "supersedes" });

    const shown = await t.query(api.show.get, { id: "cn-1" });
    if (shown.kind !== "issue") throw new Error("cn-1 is an issue");
    const idsOf = (refs: { id: string }[]) => refs.map((r) => r.id);
    expect(idsOf(shown.blocks)).toEqual(["cn-3"]);
    expect(idsOf(shown.blockedBy)).toEqual(["cn-2"]);
    expect(idsOf(shown.related)).toEqual(["cn-4"]);
    expect(idsOf(shown.discoveredFrom)).toEqual(["cn-2"]);
    expect(idsOf(shown.duplicates)).toEqual(["cn-5"]);
    expect(idsOf(shown.supersedes)).toEqual(["cn-4"]);
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

  it("returns the events in order with history, and none without it", async () => {
    const t = await seeded();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    await t.mutation(api.journal.append, {
      actor,
      id: "cn-1",
      kind: "finding",
      body: "the counter row is created on first use",
    });
    await t.mutation(api.issues.update, { actor, id: "cn-1", revision: 1, priority: 1 });
    await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 2,
      verification: { command: "vp run verify", exitCode: 0, output: "all green" },
    });

    const plain = await t.query(api.show.get, { id: "cn-1" });
    expect(plain.kind === "issue" ? plain.events : "not an issue").toBeUndefined();

    const shown = await t.query(api.show.get, { id: "cn-1", history: true });
    if (shown.kind !== "issue") throw new Error("cn-1 is an issue");
    expect(shown.events?.map((e) => e.kind)).toEqual([
      "issue.create",
      "issue.claim",
      "journal.append",
      "issue.update",
      "issue.close",
    ]);
    expect(shown.events?.map((e) => e.revision)).toEqual([0, 1, undefined, 2, 3]);
    expect(shown.events?.[3]).toMatchObject({
      actor,
      at: expect.any(Number),
      changes: { priority: { from: 0, to: 1 } },
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
