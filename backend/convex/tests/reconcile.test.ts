// Reconcile, one rule per test, because each rule is its own claim about what a fact is
// (docs/design.md §7). The five that act are asserted three ways — the entry it returned,
// the document it changed, and the event it recorded as `cairn/reconcile` — and the three
// that ask are asserted on the blocker they raised and on the documents they left alone.
//
// Ages are what most of these rules test, so the clock is faked with `toFake: ["Date"]`
// alone: convex-test's own async stays real, and `_creationTime` follows the faked clock,
// which is what J7 measures against.
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { RECONCILE } from "../lib/actor";
import { HOUR } from "../lib/thresholds";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const balder = { name: "wsl/balder", kind: "human" } as const;
const modules = import.meta.glob("../**/*.ts");

/** Only the clock is faked, so convex-test's own async is untouched. */
const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

afterEach(() => vi.useRealTimers());

/** A deployment with one project and `titles.length` open issues under ep-1. */
async function seeded(titles: string[] = []) {
  const t = convexTest(schema, modules);
  await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
  await t.mutation(api.epics.create, { actor, title: "Create to close" });
  for (const title of titles)
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title });
  return t;
}

type Harness = Awaited<ReturnType<typeof seeded>>;

const run = (t: Harness, id: string) =>
  t.mutation(api.reconcile.run, { actor, id, owner: "balder" });

const events = (t: Harness) => t.run((ctx) => ctx.db.query("events").collect());

const blockers = (t: Harness) => t.run((ctx) => ctx.db.query("blockers").collect());

/** The epic an issue sits in, read back through `show.get` and narrowed past its union. */
const epicOf = async (t: Harness, id: string) => {
  const shown = await t.query(api.show.get, { id });
  if (shown.kind !== "issue") throw new Error(`${id} is an issue`);
  return shown.epic;
};

const issueDoc = (t: Harness, id: string) =>
  t.run((ctx) =>
    ctx.db
      .query("issues")
      .withIndex("by_public_id", (q) => q.eq("id", id))
      .unique(),
  );

describe("R1, reparent an inbox issue with exactly one candidate epic", () => {
  it("moves it when its parent sits in one open epic, from either end", async () => {
    const t = await seeded(["the lifecycle"]);
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-0",
      title: "the retry path",
      parent: "cn-1",
    });
    const first = await run(t, "ep-1");
    expect(first.did).toEqual([
      {
        rule: "reparent",
        issue: { id: "cn-2", title: "the retry path" },
        to: { id: "ep-1", title: "Create to close" },
      },
    ]);
    expect(await issueDoc(t, "cn-2")).toMatchObject({ revision: 1 });
    expect(await epicOf(t, "cn-2")).toEqual({ id: "ep-1", title: "Create to close" });
    const moved = (await events(t)).filter((e) => e.kind === "issue.update");
    expect(moved).toMatchObject([
      { actor: RECONCILE, changes: { epic: { from: "ep-0", to: "ep-1" } } },
    ]);

    // The same move, asked for from the inbox's own side.
    const other = await seeded(["the lifecycle"]);
    await other.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-0",
      title: "the retry path",
      parent: "cn-1",
    });
    expect((await run(other, "ep-0")).did).toMatchObject([{ rule: "reparent" }]);
  });

  it("leaves it alone when its parent and what it came from are in two epics", async () => {
    const t = await seeded(["the lifecycle"]);
    await t.mutation(api.epics.create, { actor, title: "A session starts warm" });
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-2", title: "the hook" });
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-0",
      title: "the retry path",
      parent: "cn-1",
    });
    await t.mutation(api.edges.add, {
      actor,
      from: "cn-3",
      to: "cn-2",
      type: "discovered-from",
    });
    expect((await run(t, "ep-0")).did).toEqual([]);
    expect(await epicOf(t, "cn-3")).toMatchObject({ id: "ep-0" });
  });
});

describe("R3, release a silent claim", () => {
  it("releases one silent past 24 hours and leaves one silent 23", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seeded(["the lifecycle", "the graph"]);
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    at("2026-09-18T08:00:00Z");
    await t.mutation(api.issues.claim, { actor, id: "cn-2" });
    at("2026-09-18T10:00:00Z");

    const { did } = await run(t, "ep-1");
    expect(did).toEqual([
      {
        rule: "release",
        issue: { id: "cn-1", title: "the lifecycle" },
        from: actor,
        silentMs: 25 * HOUR,
      },
    ]);
    const released = await issueDoc(t, "cn-1");
    expect(released).toMatchObject({ status: "open" });
    expect(released!.claimedBy).toBeUndefined();
    expect(await issueDoc(t, "cn-2")).toMatchObject({ status: "in_progress", claimedBy: actor });
    expect((await events(t)).filter((e) => e.kind === "issue.release")).toMatchObject([
      { actor: RECONCILE },
    ]);
  });
});

describe("R4, spawn the follow-up an unverified close never got", () => {
  it("spawns one for a close with no child, and none for a close that has one", async () => {
    const t = await seeded(["the lifecycle", "the graph"]);
    await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 0,
      verification: { unverified: "verified on web; this machine has no ios" },
    });
    await t.mutation(api.issues.close, {
      actor,
      id: "cn-2",
      revision: 0,
      verification: { unverified: "no device here" },
      followUp: { title: "confirm it on a device", kind: "verify" },
    });

    const { did } = await run(t, "ep-1");
    expect(did).toEqual([
      {
        rule: "spawn-follow-up",
        issue: { id: "cn-1", title: "the lifecycle" },
        followUp: { id: "cn-4", title: "verify: the lifecycle" },
      },
    ]);
    const spawned = await t.query(api.show.get, { id: "cn-4" });
    expect(spawned).toMatchObject({
      kind: "issue",
      type: "follow-up",
      followUpKind: "verify",
      status: "open",
      epic: { id: "ep-1" },
      parent: { id: "cn-1" },
      description: "closed unverified: verified on web; this machine has no ios",
    });
    const created = (await events(t)).filter(
      (e) => e.kind === "issue.create" && e.actor.name === RECONCILE.name,
    );
    expect(created).toHaveLength(1);
  });
});

describe("R5, drop a `blocks` edge with a finished end", () => {
  it("deletes the edge into a closed issue and records it on both, and keeps a live one", async () => {
    const t = await seeded(["the lifecycle", "the graph", "the brief"]);
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    await t.mutation(api.edges.add, { actor, from: "cn-2", to: "cn-3", type: "blocks" });
    await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 0,
      verification: { command: "vp run verify", exitCode: 0, output: "pass" },
    });

    const { did } = await run(t, "ep-1");
    expect(did).toEqual([
      {
        rule: "drop-edge",
        from: { id: "cn-1", title: "the lifecycle" },
        to: { id: "cn-2", title: "the graph" },
      },
    ]);
    expect(await t.run((ctx) => ctx.db.query("edges").collect())).toHaveLength(1);
    const removed = (await events(t)).filter((e) => e.kind === "edge.remove");
    expect(removed).toHaveLength(2);
    expect(removed[0]).toMatchObject({
      actor: RECONCILE,
      changes: { type: "blocks", from: "cn-1", to: "cn-2" },
    });
  });
});

describe("R2, close an epic with nothing live left in it", () => {
  it("closes it once every task is done", async () => {
    const t = await seeded(["the lifecycle"]);
    await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 0,
      verification: { command: "vp run verify", exitCode: 0, output: "pass" },
    });
    const { did } = await run(t, "ep-1");
    expect(did).toEqual([{ rule: "close-epic", epic: { id: "ep-1", title: "Create to close" } }]);
    expect(await t.query(api.epics.health, { id: "ep-1" })).toMatchObject({
      status: "closed",
      revision: 1,
    });
    expect((await events(t)).filter((e) => e.kind === "epic.close")).toMatchObject([
      { actor: RECONCILE, revision: 1 },
    ]);
  });

  it("waits for an open follow-up, which a person closing by hand does not", async () => {
    const t = await seeded(["the lifecycle"]);
    await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 0,
      verification: { unverified: "no device here" },
      followUp: { title: "confirm it on a device", kind: "verify" },
    });
    expect((await run(t, "ep-1")).did).toEqual([]);
    expect(await t.query(api.epics.health, { id: "ep-1" })).toMatchObject({ status: "open" });
  });

  it("leaves an epic with no issues at all open, and never closes the inbox", async () => {
    const t = await seeded();
    expect((await run(t, "ep-1")).did).toEqual([]);
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-0", title: "stray" });
    await t.mutation(api.issues.drop, { actor, id: "cn-1", revision: 0, reason: "not wanted" });
    expect((await run(t, "ep-0")).did).toEqual([]);
    expect(await t.query(api.epics.health, { id: "ep-0" })).toMatchObject({ status: "open" });
  });
});

describe("J6, two live issues that read as the same work", () => {
  it("raises one decision holding both, and changes neither issue", async () => {
    const t = await seeded(["fix connection retry", "Fix connection retry."]);
    const before = await t.run((ctx) => ctx.db.query("issues").collect());

    const { raised } = await run(t, "ep-1");
    expect(raised).toEqual([
      {
        rule: "duplicate",
        blocker: {
          id: "bl-1",
          title: 'same title? cn-1 "fix connection retry" and cn-2 "Fix connection retry."',
        },
        issues: [
          { id: "cn-1", title: "fix connection retry" },
          { id: "cn-2", title: "Fix connection retry." },
        ],
      },
    ]);
    const [blocker] = await blockers(t);
    expect(blocker).toMatchObject({
      kind: "decision",
      owner: "balder",
      status: "raised",
      raisedBy: RECONCILE,
    });
    expect(await t.query(api.show.get, { id: "bl-1" })).toMatchObject({
      issues: [{ id: "cn-1" }, { id: "cn-2" }],
    });
    expect(await t.run((ctx) => ctx.db.query("issues").collect())).toEqual(before);
  });

  it("asks nothing once a duplicates edge says which is which", async () => {
    const t = await seeded(["fix connection retry", "Fix connection retry."]);
    await t.mutation(api.edges.add, { actor, from: "cn-2", to: "cn-1", type: "duplicates" });
    expect((await run(t, "ep-1")).raised).toEqual([]);
    expect(await blockers(t)).toEqual([]);
  });
});

describe("J7, an inbox item nobody has placed", () => {
  it("raises one for an item eight days old, from the inbox alone", async () => {
    at("2026-09-01T09:00:00Z");
    const t = await seeded(["the lifecycle"]);
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-0", title: "stray" });
    at("2026-09-09T10:00:00Z");

    expect((await run(t, "ep-1")).raised).toEqual([]);
    const { raised } = await run(t, "ep-0");
    expect(raised).toEqual([
      {
        rule: "inbox-age",
        blocker: { id: "bl-1", title: 'still in the inbox: cn-2 "stray"' },
        issues: [{ id: "cn-2", title: "stray" }],
      },
    ]);
    expect((await blockers(t))[0]).toMatchObject({
      kind: "decision",
      owner: "balder",
      raisedBy: RECONCILE,
      whatResolves:
        "give it an epic with cn update cn-2 --epic ep-N --revision 0, or drop it with a reason",
    });
  });

  it("says nothing about one six days old", async () => {
    at("2026-09-01T09:00:00Z");
    const t = await seeded();
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-0", title: "stray" });
    at("2026-09-07T09:00:00Z");
    expect((await run(t, "ep-0")).raised).toEqual([]);
  });
});

describe("J8, a blocker past the day it said to look again", () => {
  it("asks about it once, naming the date, and leaves the original alone", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seeded(["the lifecycle", "the graph"]);
    await t.mutation(api.blockers.raise, {
      actor,
      issue: "cn-1",
      kind: "external-wait",
      owner: "balder",
      title: "App Store review",
      whatResolves: "the build is approved",
      nudgeAt: Date.UTC(2026, 8, 16),
    });
    await t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" });
    const before = (await blockers(t))[0];

    const { raised } = await run(t, "ep-1");
    expect(raised).toEqual([
      {
        rule: "nudge",
        blocker: {
          id: "bl-2",
          title: 'still waiting? bl-1 "App Store review" (nudge 2026-09-16)',
        },
        issues: [
          { id: "cn-1", title: "the lifecycle" },
          { id: "cn-2", title: "the graph" },
        ],
        about: { id: "bl-1", title: "App Store review" },
      },
    ]);
    expect(await t.query(api.show.get, { id: "bl-2" })).toMatchObject({
      blockerKind: "decision",
      owner: "balder",
      raisedBy: RECONCILE,
      issues: [{ id: "cn-1" }, { id: "cn-2" }],
    });
    expect((await blockers(t))[0]).toEqual(before);
  });

  it("says nothing while the nudge is still ahead", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seeded(["the lifecycle"]);
    await t.mutation(api.blockers.raise, {
      actor,
      issue: "cn-1",
      kind: "external-wait",
      owner: "balder",
      title: "App Store review",
      whatResolves: "the build is approved",
      nudgeAt: Date.UTC(2026, 9, 1),
    });
    expect((await run(t, "ep-1")).raised).toEqual([]);
  });
});

describe("the run itself", () => {
  /** A deployment where every rule has something to act on. */
  async function everything() {
    at("2026-09-01T09:00:00Z");
    const t = await seeded([
      "the lifecycle",
      "the graph",
      "fix connection retry",
      "Fix connection retry.",
      "the brief",
    ]);
    // R5: an edge into what will be a closed issue. R3: a claim that goes silent.
    await t.mutation(api.edges.add, { actor, from: "cn-5", to: "cn-1", type: "blocks" });
    await t.mutation(api.issues.claim, { actor, id: "cn-2" });
    // R4: a close with no follow-up beside it. R1: an inbox issue with one candidate.
    await t.mutation(api.issues.close, {
      actor,
      id: "cn-5",
      revision: 0,
      verification: { unverified: "no device here" },
    });
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-0",
      title: "the retry path",
      parent: "cn-1",
    });
    // J8: a blocker whose nudge has passed.
    await t.mutation(api.blockers.raise, {
      actor,
      issue: "cn-1",
      kind: "external-wait",
      owner: "balder",
      title: "App Store review",
      whatResolves: "the build is approved",
      nudgeAt: Date.UTC(2026, 8, 3),
    });
    at("2026-09-09T10:00:00Z");
    return t;
  }

  const counts = async (t: Harness) => ({
    issues: (await t.run((ctx) => ctx.db.query("issues").collect())).length,
    blockers: (await blockers(t)).length,
    edges: (await t.run((ctx) => ctx.db.query("edges").collect())).length,
    events: (await events(t)).filter((e) => e.kind !== "reconcile.run").length,
  });

  it("acts on everything once and on nothing the second time", async () => {
    const t = await everything();
    const first = await run(t, "ep-1");
    expect(first.did.map((d) => d.rule).sort()).toEqual([
      "drop-edge",
      "release",
      "reparent",
      "spawn-follow-up",
    ]);
    expect(first.raised.map((r) => r.rule)).toEqual(["duplicate", "nudge"]);

    const after = await counts(t);
    const second = await run(t, "ep-1");
    expect(second.did).toEqual([]);
    expect(second.raised).toEqual([]);
    expect(await counts(t)).toEqual(after);
    expect((await events(t)).filter((e) => e.kind === "reconcile.run")).toHaveLength(2);
  });

  it("does not ask again once a person has resolved the raise", async () => {
    const t = await everything();
    const { raised } = await run(t, "ep-1");
    for (const entry of raised)
      await t.mutation(api.blockers.resolve, {
        actor: balder,
        id: entry.blocker.id,
        note: "both are wanted",
      });
    expect((await run(t, "ep-1")).raised).toEqual([]);
  });

  it("stamps lastReconciledAt without moving the revision, and records one event", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seeded(["the lifecycle"]);
    const { epic, at: ran, did, raised } = await run(t, "ep-1");
    expect(epic).toEqual({ id: "ep-1", title: "Create to close" });
    expect(ran).toBe(Date.now());
    expect(await t.query(api.epics.health, { id: "ep-1" })).toMatchObject({
      lastReconciledAt: ran,
      revision: 0,
    });
    const ran_ = (await events(t)).filter((e) => e.kind === "reconcile.run");
    expect(ran_).toMatchObject([
      { actor: RECONCILE, changes: { by: actor.name, owner: "balder", did, raised } },
    ]);
    // A stamp is not an edit, so the run event carries no revision either.
    expect(ran_[0]!.revision).toBeUndefined();
  });

  it("refuses an epic that is not open, and an id that is not there", async () => {
    const t = await seeded(["the lifecycle"]);
    await t.mutation(api.issues.drop, { actor, id: "cn-1", revision: 0, reason: "not wanted" });
    await t.mutation(api.epics.close, { actor, id: "ep-1", revision: 0 });
    await expect(run(t, "ep-1")).rejects.toMatchObject({
      data: { kind: "invalid", message: "ep-1 is closed; reconcile works an open epic" },
    });
    await expect(run(t, "ep-9")).rejects.toMatchObject({ data: { kind: "not-found" } });
  });
});
