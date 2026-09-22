// One direction stored, and the two rules that make the graph trustworthy: an edge asked
// for twice is one row, and a `blocks` edge that would close a loop is refused by the
// path it would close. Everything else about an edge is context and is allowed.
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { type Harness, actor, closeIssue, historyOf, rows, seed } from "./test.fixtures";

/** A deployment with one epic and three open issues, cn-1 to cn-3. */
const threeOpen = () =>
  seed({ issues: ["schema and the first verbs", "the lifecycle", "the graph"] });

const edges = (t: Harness) => rows(t, "edges");

const eventKinds = async (t: Harness, id: string) => (await historyOf(t, id)).map((e) => e.kind);

describe("edges.add", () => {
  it("stores one row and names both ends in reference form", async () => {
    const t = await threeOpen();
    expect(
      await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" }),
    ).toEqual({
      type: "blocks",
      from: { id: "cn-1", title: "schema and the first verbs" },
      to: { id: "cn-2", title: "the lifecycle" },
    });
    expect(await edges(t)).toHaveLength(1);
  });

  it("records edge.add on both endpoints", async () => {
    const t = await threeOpen();
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    expect(await eventKinds(t, "cn-1")).toEqual(["issue.create", "edge.add"]);
    expect(await eventKinds(t, "cn-2")).toEqual(["issue.create", "edge.add"]);
    const [, added] = await historyOf(t, "cn-2");
    expect(added).toMatchObject({
      kind: "edge.add",
      changes: { type: "blocks", from: "cn-1", to: "cn-2" },
    });
    // An edge is not a mutable field, so the event carries no revision.
    expect(added?.revision).toBeUndefined();
  });

  it("is idempotent: twice is one row and one pair of events", async () => {
    const t = await threeOpen();
    const args = { actor, from: "cn-1", to: "cn-2", type: "blocks" } as const;
    const first = await t.mutation(api.edges.add, args);
    expect(await t.mutation(api.edges.add, args)).toEqual(first);
    expect(await edges(t)).toHaveLength(1);
    expect(await eventKinds(t, "cn-1")).toEqual(["issue.create", "edge.add"]);
  });

  it("refuses an issue relating to itself", async () => {
    const t = await threeOpen();
    await expect(
      t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-1", type: "related" }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "an issue cannot relate to itself" },
    });
  });

  it("refuses an end it cannot find", async () => {
    const t = await threeOpen();
    for (const args of [
      { from: "cn-9", to: "cn-1" },
      { from: "cn-1", to: "cn-9" },
    ])
      await expect(
        t.mutation(api.edges.add, { actor, ...args, type: "blocks" }),
      ).rejects.toMatchObject({ data: { kind: "not-found", message: "no such id cn-9" } });
  });

  it("refuses a blocks edge that would make an issue block itself, and says which path", async () => {
    const t = await threeOpen();
    // cn-1 blocks cn-2 blocks cn-3, then cn-3 blocked by cn-1 is fine: that is the same
    // direction, not a loop.
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    await t.mutation(api.edges.add, { actor, from: "cn-2", to: "cn-3", type: "blocks" });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-3", type: "blocks" });

    await expect(
      t.mutation(api.edges.add, { actor, from: "cn-3", to: "cn-1", type: "blocks" }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "cn-1 → cn-2 → cn-3 → cn-1 would block itself" },
    });
    await expect(
      t.mutation(api.edges.add, { actor, from: "cn-2", to: "cn-1", type: "blocks" }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "cn-1 → cn-2 → cn-1 would block itself" },
    });
    expect(await edges(t)).toHaveLength(3);
  });

  it("allows a loop in the types that are only context", async () => {
    const t = await threeOpen();
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "related" });
    await t.mutation(api.edges.add, { actor, from: "cn-2", to: "cn-1", type: "related" });
    expect(await edges(t)).toHaveLength(2);
  });

  it("allows an endpoint that is closed or dropped", async () => {
    const t = await threeOpen();
    await closeIssue(t, "cn-1");
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    expect(await edges(t)).toHaveLength(1);
  });
});

describe("edges.remove", () => {
  it("deletes exactly the named edge and records it on both ends", async () => {
    const t = await threeOpen();
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "related" });

    expect(
      await t.mutation(api.edges.remove, { actor, from: "cn-1", to: "cn-2", type: "blocks" }),
    ).toMatchObject({ type: "blocks", from: { id: "cn-1" }, to: { id: "cn-2" } });

    expect((await edges(t)).map((e) => e.type)).toEqual(["related"]);
    expect(await eventKinds(t, "cn-1")).toEqual([
      "issue.create",
      "edge.add",
      "edge.add",
      "edge.remove",
    ]);
    expect(await eventKinds(t, "cn-2")).toEqual([
      "issue.create",
      "edge.add",
      "edge.add",
      "edge.remove",
    ]);
  });

  it("refuses an edge that is not there, naming the triple asked for", async () => {
    const t = await threeOpen();
    await expect(
      t.mutation(api.edges.remove, { actor, from: "cn-1", to: "cn-2", type: "blocks" }),
    ).rejects.toMatchObject({
      data: { kind: "not-found", message: "no such id cn-1 blocks cn-2" },
    });
  });
});
