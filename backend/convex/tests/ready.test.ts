// Readiness is design §4, and every clause of it is a way work goes dark if it is wrong:
// a blocker that closes and nothing notices, a defer date that never wakes, a capability
// that hides a row instead of marking it. One test per clause, and one for the order.
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { DAY } from "../lib/thresholds";
import { type Harness, actor, balder, closeIssue, raise, seed } from "./test.fixtures";

/** A deployment with one epic and two open issues, cn-1 and cn-2. */
const twoOpen = () => seed({ issues: ["a", "b"] });

const ids = async (t: Harness, can?: string[]) =>
  (await t.query(api.ready.list, can === undefined ? {} : { can })).map((i) => i.id);

describe("ready.list", () => {
  it("drops an issue with an open blocks edge into it, and takes it back the moment the blocker closes", async () => {
    const t = await twoOpen();
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    expect(await ids(t)).toEqual(["cn-1"]);

    await closeIssue(t, "cn-1");
    // Nothing in between: no recompute, no second call.
    expect(await ids(t)).toEqual(["cn-2"]);
  });

  it("is still blocked by an in-progress blocker and not by a dropped one", async () => {
    const t = await twoOpen();
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(await ids(t)).toEqual([]);

    await t.mutation(api.issues.drop, { actor, id: "cn-1", revision: 1, reason: "not doing it" });
    expect(await ids(t)).toEqual(["cn-2"]);
  });

  it("ignores the edge types that are only context", async () => {
    const t = await twoOpen();
    for (const type of ["related", "discovered-from", "duplicates", "supersedes"] as const)
      await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type });
    expect(await ids(t)).toEqual(["cn-1", "cn-2"]);
  });

  it("drops an issue with an unresolved human blocker, and takes it back when it resolves", async () => {
    const t = await twoOpen();
    await raise(t, "cn-2");
    expect(await ids(t)).toEqual(["cn-1"]);

    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "accepted" });
    expect(await ids(t)).toEqual(["cn-1", "cn-2"]);
  });

  it("hides a deferred issue from ready and from nothing else", async () => {
    const t = await twoOpen();
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

  it("takes `now` from the caller rather than the clock, for a subscriber that never re-asks", async () => {
    const t = await twoOpen();
    const deferUntil = Date.now() + DAY;
    await t.mutation(api.issues.update, { actor, id: "cn-2", revision: 0, deferUntil });
    const idsAt = async (now?: number) =>
      (await t.query(api.ready.list, now === undefined ? {} : { now })).map((i) => i.id);
    expect(await idsAt(deferUntil - 1)).toEqual(["cn-1"]);
    expect(await idsAt(deferUntil)).toEqual(["cn-1", "cn-2"]);
    expect(await idsAt()).toEqual(["cn-1"]);
  });

  it("leaves a claimed issue out: in progress is somebody's work, not ready work", async () => {
    const t = await twoOpen();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(await ids(t)).toEqual(["cn-2"]);
  });

  it("marks what this session cannot do and hides none of it", async () => {
    const t = await twoOpen();
    await t.mutation(api.issues.update, { actor, id: "cn-1", revision: 0, requires: ["ios"] });
    const cannot = async (can?: string[]) =>
      (await t.query(api.ready.list, can === undefined ? {} : { can })).map((i) => i.cannot);

    expect(await cannot(["web"])).toEqual([["ios"], []]);
    expect(await cannot(["ios", "web"])).toEqual([[], []]);
    expect(await cannot()).toEqual([["ios"], []]);
    expect(await ids(t, ["web"])).toEqual(["cn-1", "cn-2"]);
  });

  it("is ordered by priority, then age", async () => {
    const t = await twoOpen();
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
