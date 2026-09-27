// One id in, the thing and its neighbourhood out. Every list of the neighbourhood is
// asserted, the empty ones too, because the shape is the contract `cn show` formats
// against.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { DAY } from "../lib/thresholds";
import { actor, at, closeIssue, raise, seed } from "./test.fixtures";

afterEach(() => vi.useRealTimers());

const FIRST = { title: "schema, ids, revision, events, and the first verbs", priority: 0 };

const withFirst = () => seed({ issues: [FIRST] });

describe("show.get", () => {
  it("returns an issue with its journal and its neighbourhood", async () => {
    const t = await withFirst();
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "check it on a device",
      type: "follow-up",
      followUpKind: "verify",
      parent: "cn-1",
    });
    await t.mutation(api.journal.append, {
      actor,
      id: "cn-1",
      kind: "finding",
      body: "the counter row is created on first use",
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
    const t = await withFirst();
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
    const t = await withFirst();
    const shown = await t.query(api.show.get, { id: "ep-1" });
    expect(shown).toMatchObject({
      kind: "epic",
      id: "ep-1",
      counts: { open: 1 },
      // The health block of §8 rides on every epic read: nothing moving, nothing waiting,
      // and no stuck line while the one open issue is younger than the threshold.
      health: { moving: [], waiting: [] },
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

  it("leaves an epic with nothing neglected in it without a stuck line", async () => {
    const t = await withFirst();
    const shown = await t.query(api.show.get, { id: "ep-1" });
    if (shown.kind !== "epic") throw new Error("ep-1 is an epic");
    expect(shown.health.stuck).toBeUndefined();
  });

  it("marks an issue stuck when it is the one the epic's stuck line names", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await withFirst();
    // A second later, so cn-1 is the one silent longest; four days on, both are past the
    // threshold, the line names cn-1, and cn-2 is not stuck.
    at("2026-09-17T09:00:01Z");
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "younger" });
    const later = Date.now() + 4 * DAY;
    const epic = await t.query(api.show.get, { id: "ep-1", now: later });
    if (epic.kind !== "epic") throw new Error("ep-1 is an epic");
    expect(epic.health.stuck?.id).toBe("cn-1");
    expect(await t.query(api.show.get, { id: "cn-1", now: later })).toMatchObject({ stuck: true });
    expect(await t.query(api.show.get, { id: "cn-2", now: later })).toMatchObject({ stuck: false });
    expect(await t.query(api.show.get, { id: "cn-1" })).toMatchObject({ stuck: false });
  });

  it("carries the status of each end of a blocking edge, so a finished one reads as done", async () => {
    const t = await withFirst();
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "the graph" });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    await closeIssue(t, "cn-1", 1);
    expect(await t.query(api.show.get, { id: "cn-2" })).toMatchObject({
      blockedBy: [{ id: "cn-1", status: "closed" }],
    });
    expect(await t.query(api.show.get, { id: "cn-1" })).toMatchObject({
      blocks: [{ id: "cn-2", status: "open" }],
    });
    // The edge stays as history and holds nothing back: readiness ignored it already.
    expect((await t.query(api.ready.list, {})).map((i) => i.id)).toEqual(["cn-2"]);
  });

  it("returns a blocker with the issues it holds", async () => {
    const t = await withFirst();
    await raise(t, "cn-1");
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
    const t = await withFirst();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    await t.mutation(api.journal.append, {
      actor,
      id: "cn-1",
      kind: "finding",
      body: "the counter row is created on first use",
    });
    await t.mutation(api.issues.update, { actor, id: "cn-1", revision: 1, priority: 1 });
    await closeIssue(t, "cn-1", 2);

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

  it("carries the issue's links, and none when it has none", async () => {
    const t = await withFirst();
    await t.mutation(api.issues.update, {
      actor,
      id: "cn-1",
      revision: 0,
      link: [{ url: "https://example.com/doc", label: "doc" }],
    });
    expect(await t.query(api.show.get, { id: "cn-1" })).toMatchObject({
      links: [{ url: "https://example.com/doc", label: "doc", by: actor, at: expect.any(Number) }],
    });
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "bare" });
    const bare = await t.query(api.show.get, { id: "cn-2" });
    expect(bare.kind === "issue" ? bare.links : "not an issue").toBeUndefined();
  });

  it("refuses an id nothing answers to", async () => {
    const t = await withFirst();
    for (const id of ["cn-9", "ep-9", "bl-9"]) {
      await expect(t.query(api.show.get, { id })).rejects.toMatchObject({
        data: { kind: "not-found", message: `no such id ${id}` },
      });
    }
  });
});
