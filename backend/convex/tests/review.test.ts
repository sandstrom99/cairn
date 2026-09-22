// The sitting of docs/design.md §7: `review.get` reads one epic and lists what a person
// and an agent should look at together, one line per finding — near-identical titles, an
// inbox item past its age, a blocker past its nudge, a silent claim, an unverified close
// with nothing beside it, a `blocks` edge with a finished end, and whether the epic can
// close. The two facts it is held to are that it writes nothing and that it reads the
// same twice; every other test here pins one finding at its threshold.
//
// Ages are what most findings measure, so the clock is faked with `at`, which fakes `Date`
// alone: convex-test's own async stays real, and `_creationTime` follows the faked clock.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { DAY, HOUR } from "../lib/thresholds";
import {
  type Harness,
  actor,
  at,
  closeIssue,
  eventsOf,
  raise,
  rawIssue,
  rows,
  seed,
} from "./test.fixtures";

afterEach(() => vi.useRealTimers());

const review = (t: Harness, id: string) => t.query(api.review.get, { id });

const START = "2026-09-01T09:00:00Z";

/** A deployment where every finding has something to say, read eight days on. */
async function everything() {
  at(START);
  const t = await seed({
    issues: [
      "the lifecycle",
      "the graph",
      "fix connection retry",
      "Fix connection retry.",
      "the brief",
    ],
  });
  // An edge into what will be a closed issue, and a claim that goes silent.
  await t.mutation(api.edges.add, { actor, from: "cn-5", to: "cn-1", type: "blocks" });
  await t.mutation(api.issues.claim, { actor, id: "cn-2" });
  await closeIssue(t, "cn-5", 0, { verification: { unverified: "no device here" } });
  // The verb spawns the follow-up since 2026-09-22, so a close with none beside it exists
  // only in rows written before that. This is the one place the suite fabricates a state,
  // to keep the line that reads those rows tested.
  const spawned = await rawIssue(t, "cn-6");
  await t.run((ctx) => ctx.db.delete(spawned._id));
  // An inbox item with no parent: a parent in an open epic would place it.
  await t.mutation(api.issues.create, {
    actor,
    project: "cn",
    epic: "ep-0",
    title: "the retry path",
  });
  // A blocker whose nudge date has passed.
  await raise(t, "cn-1", {
    kind: "external-wait",
    title: "App Store review",
    whatResolves: "the build is approved",
    nudgeAt: Date.UTC(2026, 8, 3),
  });
  at("2026-09-09T10:00:00Z");
  return t;
}

const counts = async (t: Harness) => ({
  issues: (await rows(t, "issues")).length,
  blockers: (await rows(t, "blockers")).length,
  edges: (await rows(t, "edges")).length,
  events: (await eventsOf(t)).length,
});

describe("review.get", () => {
  it("lists every finding of the epic, each in reference form", async () => {
    const t = await everything();
    const view = await review(t, "ep-1");
    expect(view.epic).toMatchObject({
      id: "ep-1",
      title: "Create to close",
      counts: { open: 3, inProgress: 1, closed: 1, dropped: 0, followUps: 0 },
    });
    expect(view.canClose).toBe(false);
    expect(view.near).toEqual([
      {
        a: { id: "cn-3", title: "fix connection retry" },
        b: { id: "cn-4", title: "Fix connection retry." },
      },
    ]);
    expect(view.inbox).toEqual([]);
    expect(view.nudges).toEqual([
      {
        id: "bl-1",
        title: "App Store review",
        owner: "balder",
        nudgeAt: Date.UTC(2026, 8, 3),
        holds: [{ id: "cn-1", title: "the lifecycle" }],
      },
    ]);
    expect(view.silent).toEqual([
      { id: "cn-2", title: "the graph", claimedBy: actor, lastActivity: Date.parse(START) },
    ]);
    expect(view.unverified).toEqual([
      { id: "cn-5", title: "the brief", closedAt: Date.parse(START), reason: "no device here" },
    ]);
    expect(view.edges).toEqual([
      {
        from: { id: "cn-5", title: "the brief", status: "closed" },
        to: { id: "cn-1", title: "the lifecycle", status: "open" },
      },
    ]);
  });

  it("writes nothing and reads the same twice", async () => {
    const t = await everything();
    const before = await counts(t);
    const first = await review(t, "ep-1");
    const second = await review(t, "ep-1");
    expect(await counts(t)).toEqual(before);
    expect(second).toEqual(first);
  });

  it("lists an inbox item past seven days for ep-0, and not one at six", async () => {
    const t = await everything();
    expect((await review(t, "ep-0")).inbox).toEqual([
      // `_creationTime` carries a fraction under convex-test, so it is pinned to the millisecond.
      { id: "cn-7", title: "the retry path", createdAt: expect.closeTo(Date.parse(START), 0) },
    ]);

    at(START);
    const fresh = await seed();
    await fresh.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-0",
      title: "the retry path",
    });
    at(Date.parse(START) + 6 * DAY);
    expect((await review(fresh, "ep-0")).inbox).toEqual([]);
  });

  it("marks a claim silent past 24 hours, not at 23", async () => {
    const claimed = async (after: number) => {
      at(START);
      const t = await seed({ issues: ["the graph"] });
      await t.mutation(api.issues.claim, { actor, id: "cn-1" });
      at(Date.parse(START) + after);
      return (await review(t, "ep-1")).silent;
    };
    expect(await claimed(23 * HOUR)).toEqual([]);
    expect(await claimed(25 * HOUR)).toEqual([
      { id: "cn-1", title: "the graph", claimedBy: actor, lastActivity: Date.parse(START) },
    ]);
  });

  it("says nothing about a pair marked as duplicates", async () => {
    const t = await everything();
    await t.mutation(api.edges.add, { actor, from: "cn-4", to: "cn-3", type: "duplicates" });
    expect((await review(t, "ep-1")).near).toEqual([]);
  });

  it("says the epic can close when every issue is finished, and not the inbox", async () => {
    const done = await seed({ issues: ["the lifecycle"] });
    await closeIssue(done, "cn-1");
    expect((await review(done, "ep-1")).canClose).toBe(true);

    const residue = await seed({ issues: ["the lifecycle"] });
    await closeIssue(residue, "cn-1", 0, {
      followUp: { title: "confirm on a device", kind: "verify" },
    });
    expect((await review(residue, "ep-1")).canClose).toBe(false);

    const inbox = await seed();
    await inbox.mutation(api.issues.create, { actor, project: "cn", epic: "ep-0", title: "stray" });
    await closeIssue(inbox, "cn-1");
    expect((await review(inbox, "ep-0")).canClose).toBe(false);

    // A closed epic reviews to nothing that can close, and is not refused.
    await done.mutation(api.epics.close, { actor, id: "ep-1", revision: 0 });
    expect(await review(done, "ep-1")).toMatchObject({
      epic: { id: "ep-1", status: "closed" },
      canClose: false,
    });
  });
});
