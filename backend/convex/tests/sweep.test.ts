// The scheduled sweep (docs/design.md §7): `reconcile.sweep` fans out to one
// `reconcile.sweepEpic` per open epic, and each runs exactly the rules `reconcile.run`
// runs — so what is tested here is the fan-out, not the rules, which reconcile.test.ts
// owns. `CAIRN_OWNER` is the on-switch, and it is asserted from both sides.
//
// Every timer is faked, `at(…, "all")`, not the clock alone as in reconcile.test.ts:
// convex-test's scheduler runs its functions on `setTimeout`, so
// `finishAllScheduledFunctions` is handed `vi.runAllTimers` to drive them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { RECONCILE } from "../lib/actor";
import { DAY, HOUR } from "../lib/thresholds";
import { type Harness, actor, at, eventsOf, raise, rows, seed } from "./test.fixtures";

const T0 = Date.UTC(2026, 8, 17, 9);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/**
 * Two open epics with one issue each, and a blocker on ep-1's issue whose nudge falls a
 * day after the seed: one epic with something to do, one with nothing.
 */
async function twoEpics() {
  at(T0, "all");
  const t = await seed({ issues: ["the graph"] });
  await t.mutation(api.epics.create, { actor, title: "A session starts warm" });
  await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-2", title: "the hook" });
  await raise(t, "cn-1", {
    kind: "external-wait",
    title: "App Store review",
    whatResolves: "the build is approved",
    nudgeAt: T0 + DAY,
  });
  return t;
}

/** The sweep and the epics it scheduled, run to completion. */
const sweep = async (t: Harness) => {
  const answer = await t.mutation(internal.reconcile.sweep, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return answer;
};

const epics = (t: Harness) => rows(t, "epics");

const raisedByReconcile = async (t: Harness) =>
  (await rows(t, "blockers")).filter((b) => b.raisedBy.name === RECONCILE.name);

describe("reconcile.sweep", () => {
  it("reconciles every open epic, and records a run only for the one that had work", async () => {
    vi.stubEnv("CAIRN_OWNER", "balder");
    const t = await twoEpics();
    at(T0 + 2 * DAY, "all");
    const swept = Date.now();

    const answer = await sweep(t);
    expect(answer).toEqual({
      owner: "balder",
      epics: [
        { id: "ep-1", title: "Create to close" },
        { id: "ep-2", title: "A session starts warm" },
      ],
    });
    for (const epic of await epics(t)) expect(epic.lastReconciledAt).toBe(swept);

    const [nudge, ...rest] = await raisedByReconcile(t);
    expect(rest).toEqual([]);
    expect(nudge).toMatchObject({ kind: "decision", owner: "balder", status: "raised" });
    expect(nudge!.title).toMatch(/^still waiting\? bl-1 "App Store review"/);

    expect(await eventsOf(t, "reconcile.sweep")).toMatchObject([
      {
        actor: RECONCILE,
        changes: { owner: "balder", epics: [{ id: "ep-1" }, { id: "ep-2" }] },
      },
    ]);
    // ep-2 had nothing to do, so it left no run behind; ep-1's names the sweep as caller.
    const runs = await eventsOf(t, "reconcile.run");
    const ep1 = (await epics(t)).find((e) => e.id === "ep-1")!;
    expect(runs).toMatchObject([
      { epicId: ep1._id, changes: { by: "cairn/sweep", owner: "balder" } },
    ]);
  });

  it("acts on nothing and raises nothing when it sweeps again the same day", async () => {
    vi.stubEnv("CAIRN_OWNER", "balder");
    const t = await twoEpics();
    at(T0 + 2 * DAY, "all");
    await sweep(t);
    at(T0 + 2 * DAY + HOUR, "all");
    await sweep(t);

    expect(await raisedByReconcile(t)).toHaveLength(1);
    expect(await eventsOf(t, "reconcile.run")).toHaveLength(1);
    expect(await eventsOf(t, "reconcile.sweep")).toHaveLength(2);
  });

  it("does nothing at all when the deployment has no CAIRN_OWNER", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = await twoEpics();
    at(T0 + 2 * DAY, "all");

    expect(await sweep(t)).toEqual({ owner: null, epics: [] });
    expect(warn).toHaveBeenCalledTimes(1);
    for (const epic of await epics(t)) expect(epic.lastReconciledAt).toBeUndefined();
    expect(await eventsOf(t, "reconcile.sweep")).toEqual([]);
    expect(await eventsOf(t, "reconcile.run")).toEqual([]);
    expect(await raisedByReconcile(t)).toEqual([]);
    warn.mockRestore();
  });

  it("skips an epic closed between the sweep and its turn", async () => {
    const t = await twoEpics();
    await t.mutation(api.epics.create, { actor, title: "The reconcile sweep" });
    await t.mutation(api.epics.close, { actor, id: "ep-3", revision: 0 });
    const before = await eventsOf(t);

    expect(
      await t.mutation(internal.reconcile.sweepEpic, { id: "ep-3", owner: "balder" }),
    ).toBeNull();
    expect(await eventsOf(t)).toEqual(before);
  });
});
