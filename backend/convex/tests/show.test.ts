// One id in, the thing and its neighbourhood out. Every list of the neighbourhood is
// asserted, the empty ones too, because the shape is the contract `cn show` formats
// against.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { DAY } from "../lib/thresholds";
import { actor, at, closeIssue, raise, rawIssue, seed } from "./test.fixtures";

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
      followUps: [{ id: "cn-2", title: "check it on a device", status: "open" }],
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
    expect(shown.blocks).toEqual([{ id: "cn-3", title: "the graph", status: "open" }]);
    expect(shown.blockedBy).toEqual([{ id: "cn-2", title: "the lifecycle", status: "open" }]);
    expect(shown.related).toEqual([{ id: "cn-4", title: "the brief", status: "open" }]);
    expect(shown.discoveredFrom).toEqual([{ id: "cn-2", title: "the lifecycle", status: "open" }]);
    expect(shown.duplicates).toEqual([{ id: "cn-5", title: "a duplicate", status: "open" }]);
    expect(shown.supersedes).toEqual([{ id: "cn-4", title: "the brief", status: "open" }]);
  });

  it("names every issue in the neighbourhood with its status, a dropped follow-up as dropped", async () => {
    const t = await withFirst();
    for (const title of ["check it on a device", "check it on a phone"])
      await t.mutation(api.issues.create, {
        actor,
        project: "cn",
        epic: "ep-1",
        title,
        type: "follow-up",
        followUpKind: "verify",
        parent: "cn-1",
      });
    for (const title of ["the lifecycle", "the graph", "the brief", "the feed"])
      await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-4", type: "related" });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-5", type: "discovered-from" });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-6", type: "duplicates" });
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-7", type: "supersedes" });
    const revision = async (id: string) => (await rawIssue(t, id)).revision;
    const drop = async (id: string) =>
      t.mutation(api.issues.drop, {
        actor,
        id,
        revision: await revision(id),
        reason: "not wanted",
      });
    await drop("cn-2");
    await closeIssue(t, "cn-3", await revision("cn-3"));
    await closeIssue(t, "cn-4", await revision("cn-4"));
    await drop("cn-5");
    await closeIssue(t, "cn-6", await revision("cn-6"));
    await closeIssue(t, "cn-7", await revision("cn-7"));

    const shown = await t.query(api.show.get, { id: "cn-1" });
    if (shown.kind !== "issue") throw new Error("cn-1 is an issue");
    expect(shown.followUps).toEqual([
      { id: "cn-2", title: "check it on a device", status: "dropped" },
      { id: "cn-3", title: "check it on a phone", status: "closed" },
    ]);
    expect(shown.related).toEqual([{ id: "cn-4", title: "the lifecycle", status: "closed" }]);
    expect(shown.discoveredFrom).toEqual([{ id: "cn-5", title: "the graph", status: "dropped" }]);
    expect(shown.duplicates).toEqual([{ id: "cn-6", title: "the brief", status: "closed" }]);
    expect(shown.supersedes).toEqual([{ id: "cn-7", title: "the feed", status: "closed" }]);

    // A follow-up names its parent with the parent's status, open until it closes.
    expect(await t.query(api.show.get, { id: "cn-3" })).toMatchObject({
      parent: { id: "cn-1", status: "open" },
    });
    await closeIssue(t, "cn-1", await revision("cn-1"));
    expect(await t.query(api.show.get, { id: "cn-3" })).toMatchObject({
      parent: { id: "cn-1", status: "closed" },
    });

    // A blocker names each issue it holds with its status, a dropped one among them.
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "the page" });
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "the hook" });
    await raise(t, "cn-8");
    await t.mutation(api.blockers.raise, { actor, issue: "cn-9", on: "bl-1" });
    await drop("cn-8");
    expect(await t.query(api.show.get, { id: "bl-1" })).toMatchObject({
      issues: [
        { id: "cn-8", title: "the page", status: "dropped" },
        { id: "cn-9", title: "the hook", status: "open" },
      ],
    });
  });

  it("returns an epic with its open issues in list order", async () => {
    const t = await withFirst();
    const shown = await t.query(api.show.get, { id: "ep-1" });
    expect(shown).toMatchObject({
      kind: "epic",
      id: "ep-1",
      counts: { open: 1 },
      // The health block of §8 rides on every epic read: nothing moving, nothing waiting,
      // and nothing stuck while the one open issue is younger than its priority's limit.
      health: { moving: [], stuck: [], waiting: [] },
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

  it("leaves an epic with nothing neglected in it an empty stuck list", async () => {
    const t = await withFirst();
    const shown = await t.query(api.show.get, { id: "ep-1" });
    if (shown.kind !== "epic") throw new Error("ep-1 is an epic");
    expect(shown.health.stuck).toEqual([]);
  });

  it("marks an issue stuck exactly when it is among its epic's stuck issues", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await withFirst();
    // Four days on: cn-1, a P0, is past its day; cn-2, a P1, is past its three days; cn-3,
    // a P2, is inside its week; and cn-4, a P0 a blocker holds, is waiting instead.
    for (const [title, priority] of [
      ["the P1", 1],
      ["the P2", 2],
      ["the held P0", 0],
    ] as const)
      await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title, priority });
    await raise(t, "cn-4");
    const later = Date.now() + 4 * DAY;
    const epic = await t.query(api.show.get, { id: "ep-1", now: later });
    if (epic.kind !== "epic") throw new Error("ep-1 is an epic");
    expect(epic.health.stuck.map((i) => i.id)).toEqual(["cn-1", "cn-2"]);
    for (const [id, stuck] of [
      ["cn-1", true],
      ["cn-2", true],
      ["cn-3", false],
      ["cn-4", false],
    ] as const)
      expect(await t.query(api.show.get, { id, now: later })).toMatchObject({ stuck });
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

  it("carries an epic's links and a blocker's", async () => {
    const t = await withFirst();
    await t.mutation(api.epics.create, {
      actor,
      title: "a plan",
      link: [{ url: "https://example.com/plan", label: "plan" }],
    });
    await raise(t, "cn-1", { link: [{ url: "https://example.com/options" }] });
    expect(await t.query(api.show.get, { id: "ep-2" })).toMatchObject({
      kind: "epic",
      links: [
        { url: "https://example.com/plan", label: "plan", by: actor, at: expect.any(Number) },
      ],
    });
    expect(await t.query(api.show.get, { id: "bl-1" })).toMatchObject({
      kind: "blocker",
      links: [{ url: "https://example.com/options", by: actor, at: expect.any(Number) }],
    });
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
