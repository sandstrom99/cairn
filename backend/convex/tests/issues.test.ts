// The create rules, one test each, because every one of them is a way an issue could
// become something no later verb can reason about: an id minted from the wrong counter,
// an epic that is not open, a follow-up with no kind, a priority outside 0 to 4.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import {
  type Harness,
  actor,
  at,
  balder,
  closeIssue,
  eventsOf,
  other,
  raise,
  ran,
  rawIssue,
  seed,
} from "./test.fixtures";

afterEach(() => vi.useRealTimers());

/** The second project some create tests mint into, beside the seed's `cn`. */
const otherProject = (t: Harness) =>
  t.mutation(api.projects.create, { actor, slug: "x", name: "the other one" });

describe("issues.create", () => {
  it("mints per project: cn-1, cn-2, then x-1", async () => {
    const t = await seed();
    await otherProject(t);
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
    const elsewhere = await t.mutation(api.issues.create, {
      actor,
      project: "x",
      epic: "ep-1",
      title: "somewhere else",
    });
    expect([first.id, second.id, elsewhere.id]).toEqual(["cn-1", "cn-2", "x-1"]);
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
    const t = await seed();
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
    const t = await seed();
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
    const t = await seed();
    await expect(
      t.mutation(api.issues.create, { actor, project: "nope", epic: "ep-1", title: "x" }),
    ).rejects.toMatchObject({ data: { kind: "not-found", message: "no such project nope" } });
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
    const t = await seed();
    await t.mutation(api.epics.create, { actor, title: "A session starts warm" });
    await t.mutation(api.epics.close, { actor, id: "ep-1", revision: 0 });
    await t.mutation(api.epics.close, {
      actor,
      id: "ep-2",
      revision: 0,
      drop: true,
      reason: "not shipping",
    });
    for (const epic of ["ep-1", "ep-2"])
      await expect(
        t.mutation(api.issues.create, { actor, project: "cn", epic, title: "x" }),
      ).rejects.toMatchObject({ data: { kind: "invalid" } });
  });

  it("pairs type and followUpKind both ways", async () => {
    const t = await seed();
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
    const t = await seed();
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
    const t = await seed();
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "one" });
    const events = await eventsOf(t, "issue.create");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor,
      revision: 0,
      changes: { id: "cn-1", status: "open" },
    });
    expect(events[0]!.issueId).toBeDefined();
    expect(events[0]!.epicId).toBeDefined();
  });

  it("hands back the near-identical live titles in the epic, and still creates", async () => {
    const t = await seed({ issues: ["fix connection retry", "the graph"] });
    const created = await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "Fix connection retry.",
    });
    expect(created).toMatchObject({
      id: "cn-3",
      near: [{ id: "cn-1", title: "fix connection retry" }],
      placed: false,
    });
    expect(await rawIssue(t, "cn-3")).toMatchObject({ title: "Fix connection retry." });

    const apart = await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "the lifecycle",
    });
    expect(apart.near).toEqual([]);
  });

  it("does not match a finished issue, or one in another epic", async () => {
    const t = await seed({ issues: ["fix connection retry"] });
    await closeIssue(t, "cn-1");
    const after = await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "Fix connection retry.",
    });
    expect(after.near).toEqual([]);

    await t.mutation(api.epics.create, { actor, title: "A session starts warm" });
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-2", title: "the graph" });
    const elsewhere = await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "The graph.",
    });
    expect(elsewhere.near).toEqual([]);
  });

  it("places an inbox issue beside its parent when the parent's epic is open", async () => {
    const t = await seed({ issues: ["the lifecycle"] });
    const created = await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-0",
      title: "the retry path",
      parent: "cn-1",
    });
    expect(created).toMatchObject({
      id: "cn-2",
      epic: { id: "ep-1", title: "Create to close" },
      parent: { id: "cn-1", title: "the lifecycle" },
      placed: true,
    });
    expect(await t.query(api.show.get, { id: "cn-2" })).toMatchObject({
      epic: { id: "ep-1" },
    });
  });

  it("leaves an inbox issue in ep-0 with no parent, a parent in ep-0, or a parent in a closed epic", async () => {
    const t = await seed({ issues: ["the lifecycle"] });
    const inbox = (title: string, parent?: string) =>
      t.mutation(api.issues.create, {
        actor,
        project: "cn",
        epic: "ep-0",
        title,
        ...(parent === undefined ? {} : { parent }),
      });

    const alone = await inbox("the retry path");
    expect(alone).toMatchObject({ id: "cn-2", epic: { id: "ep-0" }, placed: false });

    const underInbox = await inbox("the retry path, again", "cn-2");
    expect(underInbox).toMatchObject({ id: "cn-3", epic: { id: "ep-0" }, placed: false });

    await t.mutation(api.epics.create, { actor, title: "A session starts warm" });
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-2", title: "the hook" });
    await closeIssue(t, "cn-4");
    await t.mutation(api.epics.close, { actor, id: "ep-2", revision: 0 });
    const underClosed = await inbox("the hook, later", "cn-4");
    expect(underClosed).toMatchObject({ id: "cn-5", epic: { id: "ep-0" }, placed: false });
  });
});

describe("issues.list", () => {
  it("orders by priority then age, and filters by epic, project and status", async () => {
    const t = await seed();
    await otherProject(t);
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

    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
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

// The lifecycle, claim to close. Each rule below is a way work could be lost or taken:
// two agents on one issue, a write against a revision that has moved, a close that
// nothing proves, residue that never gets created because the parent closed first.

/** The seeded deployment plus cn-1, open and unclaimed at revision 0. */
const withIssue = () =>
  seed({ issues: [{ title: "the lifecycle, claim to close with evidence", priority: 0 }] });

describe("issues.claim", () => {
  it("is first writer wins: the second is told who holds it and since when", async () => {
    const t = await withIssue();
    const mine = await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(mine).toMatchObject({ status: "in_progress", claimedBy: actor, revision: 1 });
    expect(mine.claimedAt).toEqual(expect.any(Number));
    await expect(t.mutation(api.issues.claim, { actor: other, id: "cn-1" })).rejects.toMatchObject({
      data: { kind: "claimed", id: "cn-1", by: actor, since: mine.claimedAt },
    });

    // The event names the move, not the timestamps and actor object the patch carries.
    const [event] = await eventsOf(t, "issue.claim");
    expect(event!.changes).toEqual({
      status: { from: "open", to: "in_progress" },
      claimedBy: { to: actor.name },
    });
  });

  it("is idempotent for the same actor: one event, one revision", async () => {
    const t = await withIssue();
    const first = await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    const again = await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(again.revision).toBe(first.revision);
    expect(again.claimedAt).toBe(first.claimedAt);
    expect(await eventsOf(t, "issue.claim")).toHaveLength(1);
  });

  it("tells two sessions of one name apart: the second is refused, as another session", async () => {
    const t = await withIssue();
    const one = { ...actor, session: "s-1" };
    const two = { ...actor, session: "s-2" };
    const mine = await t.mutation(api.issues.claim, { actor: one, id: "cn-1" });
    expect(mine.claimedBy).toEqual(one);
    await expect(t.mutation(api.issues.claim, { actor: two, id: "cn-1" })).rejects.toMatchObject({
      data: {
        kind: "claimed",
        by: one,
        since: mine.claimedAt,
        message: expect.stringContaining("held by wsl/claude in another session"),
      },
    });
    // A shell with no session is not the session that holds it either.
    await expect(t.mutation(api.issues.claim, { actor, id: "cn-1" })).rejects.toMatchObject({
      data: { kind: "claimed", by: one },
    });
    // The same session again has claimed once, and the one event carries the session.
    const again = await t.mutation(api.issues.claim, { actor: one, id: "cn-1" });
    expect(again.revision).toBe(mine.revision);
    const events = await eventsOf(t, "issue.claim");
    expect(events).toHaveLength(1);
    expect(events[0]!.actor).toEqual(one);
  });

  it("holds a claim written before sessions existed against a session of the same name", async () => {
    const t = await withIssue();
    const held = await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(held.claimedBy).toEqual(actor);
    await expect(
      t.mutation(api.issues.claim, { actor: { ...actor, session: "s-1" }, id: "cn-1" }),
    ).rejects.toMatchObject({
      data: { kind: "claimed", by: actor, message: expect.stringContaining("another session") },
    });
    // A different name is refused without the session clause: it is simply held.
    await expect(t.mutation(api.issues.claim, { actor: other, id: "cn-1" })).rejects.toMatchObject({
      data: {
        kind: "claimed",
        message: `cn-1 is held by wsl/claude since ${new Date(held.claimedAt!).toISOString()}`,
      },
    });
  });

  it("leaves release on the name alone, so another session of it can hand a claim back", async () => {
    const t = await withIssue();
    const one = { ...actor, session: "s-1" };
    const two = { ...actor, session: "s-2" };
    await t.mutation(api.issues.claim, { actor: one, id: "cn-1" });
    const released = await t.mutation(api.issues.release, { actor: two, id: "cn-1" });
    expect(released.status).toBe("open");
    const taken = await t.mutation(api.issues.claim, { actor: two, id: "cn-1" });
    expect(taken.claimedBy).toEqual(two);
  });

  it("refuses what is closed or dropped, because reopening is not a thing", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "the graph" });
    await closeIssue(t, "cn-1");
    await t.mutation(api.issues.drop, { actor, id: "cn-2", revision: 0, reason: "not wanted" });
    for (const id of ["cn-1", "cn-2"])
      await expect(t.mutation(api.issues.claim, { actor, id })).rejects.toMatchObject({
        data: { kind: "invalid", message: expect.stringContaining("follow-up") },
      });
  });
});

describe("issues.release", () => {
  it("gives it back, and an agent cannot take another's claim away", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    await expect(
      t.mutation(api.issues.release, { actor: other, id: "cn-1" }),
    ).rejects.toMatchObject({ data: { kind: "claimed", by: actor } });

    const released = await t.mutation(api.issues.release, { actor, id: "cn-1" });
    expect(released).toMatchObject({ status: "open", revision: 2 });
    expect(released.claimedBy).toBeUndefined();
    expect(released.claimedAt).toBeUndefined();

    const [event] = await eventsOf(t, "issue.release");
    expect(event!.changes).toEqual({
      status: { from: "in_progress", to: "open" },
      claimedBy: { from: actor.name },
    });
  });

  it("lets a human release anybody's claim, and does nothing to an unclaimed issue", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    expect(await t.mutation(api.issues.release, { actor: balder, id: "cn-1" })).toMatchObject({
      status: "open",
      revision: 2,
    });
    const again = await t.mutation(api.issues.release, { actor, id: "cn-1" });
    expect(again.revision).toBe(2);
    expect(await eventsOf(t, "issue.release")).toHaveLength(1);
  });
});

describe("issues.update", () => {
  it("rejects a stale revision with every change since it", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    await expect(
      t.mutation(api.issues.update, { actor: other, id: "cn-1", revision: 0, priority: 1 }),
    ).rejects.toMatchObject({
      data: {
        kind: "stale",
        id: "cn-1",
        yours: 0,
        current: 1,
        since: [{ revision: 1, actor, kind: "issue.claim" }],
      },
    });
  });

  it("takes the current revision, stamps lastActivity, and records an epic move as ids", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await withIssue();
    await t.mutation(api.epics.create, { actor, title: "A session starts warm" });
    const before = (await rawIssue(t, "cn-1")).lastActivity;

    at("2026-09-17T10:00:00Z");
    const updated = await t.mutation(api.issues.update, {
      actor,
      id: "cn-1",
      revision: 0,
      priority: 1,
      epic: "ep-2",
      requires: ["ios"],
    });
    expect(updated).toMatchObject({
      revision: 1,
      priority: 1,
      epic: { id: "ep-2", title: "A session starts warm" },
      requires: ["ios"],
    });
    expect(updated.lastActivity).toBe(Date.now());
    expect(updated.lastActivity).toBeGreaterThan(before);

    const [event] = await eventsOf(t, "issue.update");
    expect(event!.changes).toEqual({
      priority: { from: 0, to: 1 },
      requires: { from: [], to: ["ios"] },
      epic: { from: "ep-1", to: "ep-2" },
    });
  });

  it("clears a deferUntil with null and leaves it alone when absent", async () => {
    const t = await withIssue();
    const when = Date.now() + 86_400_000;
    expect(
      await t.mutation(api.issues.update, { actor, id: "cn-1", revision: 0, deferUntil: when }),
    ).toMatchObject({ deferUntil: when });
    expect(
      await t.mutation(api.issues.update, { actor, id: "cn-1", revision: 1, title: "same date" }),
    ).toMatchObject({ deferUntil: when });
    const cleared = await t.mutation(api.issues.update, {
      actor,
      id: "cn-1",
      revision: 2,
      deferUntil: null,
    });
    expect(cleared.deferUntil).toBeUndefined();
  });

  it("refuses an update with nothing in it, an unknown epic and a closed issue", async () => {
    const t = await withIssue();
    await expect(
      t.mutation(api.issues.update, { actor, id: "cn-1", revision: 0 }),
    ).rejects.toMatchObject({ data: { kind: "invalid", message: "nothing to update" } });
    await expect(
      t.mutation(api.issues.update, { actor, id: "cn-1", revision: 0, epic: "ep-9" }),
    ).rejects.toMatchObject({ data: { kind: "not-found" } });

    await closeIssue(t, "cn-1");
    await expect(
      t.mutation(api.issues.update, { actor, id: "cn-1", revision: 1, priority: 1 }),
    ).rejects.toMatchObject({ data: { kind: "invalid" } });
  });
});

describe("issues.close", () => {
  it("stores the record with who closed it and when, and clears the claim", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    const { issue, followUp } = await closeIssue(t, "cn-1", 1);
    expect(followUp).toBeUndefined();
    expect(issue).toMatchObject({
      status: "closed",
      revision: 2,
      verification: { ...ran, by: actor },
    });
    expect(issue.verification?.at).toEqual(expect.any(Number));
    expect(issue.closedAt).toEqual(expect.any(Number));
    expect(issue.claimedBy).toBeUndefined();
    expect(issue.claimedAt).toBeUndefined();

    const [event] = await eventsOf(t, "issue.close");
    expect(event!.changes).toEqual({
      status: { from: "in_progress", to: "closed" },
      verification: { to: "vp run verify (exit 0)" },
    });
  });

  it("refuses a close with no record at all, at the validator", async () => {
    const t = await withIssue();
    // Deliberately untyped: the validator is what refuses, and a caller that skips the
    // record is exactly what it exists to stop.
    const noRecord = { actor, id: "cn-1", revision: 0 } as unknown as {
      actor: typeof actor;
      id: string;
      revision: number;
      verification: { unverified: string };
    };
    await expect(t.mutation(api.issues.close, noRecord)).rejects.toThrow();
    expect((await rawIssue(t, "cn-1")).status).toBe("open");
  });

  it("refuses a command that failed, and an unverified close with no reason", async () => {
    const t = await withIssue();
    await expect(
      closeIssue(t, "cn-1", 0, {
        verification: { command: "vp run verify", exitCode: 1, output: "1 failed" },
      }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: expect.stringContaining("exited 1") },
    });
    await expect(
      closeIssue(t, "cn-1", 0, { verification: { unverified: "  " } }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "an unverified close needs a reason" },
    });
    expect((await rawIssue(t, "cn-1")).status).toBe("open");
  });

  it("refuses a second close", async () => {
    const t = await withIssue();
    await closeIssue(t, "cn-1");
    await expect(closeIssue(t, "cn-1", 1)).rejects.toMatchObject({
      data: { kind: "invalid", message: "cn-1 is already closed" },
    });
  });

  it("refuses an agent closing another's claim, and lets a human do it", async () => {
    const t = await withIssue();
    await t.mutation(api.issues.claim, { actor: other, id: "cn-1" });
    await expect(closeIssue(t, "cn-1", 1)).rejects.toMatchObject({
      data: { kind: "claimed", by: other },
    });
    const { issue } = await closeIssue(t, "cn-1", 1, { actor: balder });
    expect(issue).toMatchObject({ status: "closed", verification: { by: balder } });
  });

  it("creates the follow-up in the same mutation, linked and in the same epic", async () => {
    const t = await withIssue();
    const { issue, followUp } = await closeIssue(t, "cn-1", 0, {
      verification: { unverified: "verified on android and web; this machine has no ios" },
      followUp: { title: "confirm the retry path on a device", kind: "verify", requires: ["ios"] },
    });
    expect(issue.status).toBe("closed");
    expect(followUp).toMatchObject({
      id: "cn-2",
      title: "confirm the retry path on a device",
      type: "follow-up",
      followUpKind: "verify",
      status: "open",
      requires: ["ios"],
      priority: 0,
      parent: { id: "cn-1" },
      epic: { id: "ep-1" },
      revision: 0,
    });
    // The residue is counted beside the epic's tasks, never inside them.
    expect(await t.query(api.show.get, { id: "ep-1" })).toMatchObject({
      counts: { closed: 1, open: 0, followUps: 1 },
    });
  });

  it("creates neither the close nor the follow-up when the kind is not one of the three", async () => {
    const t = await withIssue();
    await expect(
      closeIssue(t, "cn-1", 0, {
        followUp: { title: "ship it", kind: "ship" as unknown as "verify" },
      }),
    ).rejects.toThrow();
    expect((await rawIssue(t, "cn-1")).status).toBe("open");
    expect((await t.query(api.issues.list, {})).map((i) => i.id)).toEqual(["cn-1"]);
  });

  it("spawns the verify follow-up an unverified close never got, by the closer", async () => {
    const t = await withIssue();
    const { followUp } = await closeIssue(t, "cn-1", 0, {
      verification: { unverified: "no device here" },
    });
    expect(followUp).toMatchObject({
      id: "cn-2",
      title: "verify: the lifecycle, claim to close with evidence",
      type: "follow-up",
      followUpKind: "verify",
      parent: { id: "cn-1" },
      priority: 0,
      description: "closed unverified: no device here",
      epic: { id: "ep-1" },
    });
    const created = (await eventsOf(t, "issue.create")).find(
      (e) => (e.changes as { id: string }).id === "cn-2",
    );
    expect(created).toMatchObject({ actor });
  });

  it("spawns nothing when --follow-up came with the close, or a child already exists, or the close ran a command", async () => {
    const children = async (t: Harness) =>
      (await t.query(api.issues.list, {})).filter((i) => i.parent?.id === "cn-1");

    const given = await withIssue();
    const { followUp } = await closeIssue(given, "cn-1", 0, {
      verification: { unverified: "no device here" },
      followUp: { title: "confirm on a device", kind: "verify" },
    });
    expect(followUp).toMatchObject({ title: "confirm on a device" });
    expect(await children(given)).toHaveLength(1);

    const existing = await withIssue();
    await existing.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title: "check it on a device",
      type: "follow-up",
      followUpKind: "verify",
      parent: "cn-1",
    });
    const second = await closeIssue(existing, "cn-1", 0, {
      verification: { unverified: "no device here" },
    });
    expect(second.followUp).toBeUndefined();
    expect(await children(existing)).toHaveLength(1);

    const proven = await withIssue();
    expect((await closeIssue(proven, "cn-1")).followUp).toBeUndefined();
    expect(await children(proven)).toEqual([]);
  });

  it("answers that the epic can close on its last issue, and not before", async () => {
    const t = await seed({ issues: ["the lifecycle", "the graph"] });
    expect((await closeIssue(t, "cn-1")).epicDone).toBeUndefined();
    expect((await closeIssue(t, "cn-2")).epicDone).toEqual({
      id: "ep-1",
      title: "Create to close",
      revision: 0,
    });
    // An offer, never a close.
    expect(await t.query(api.show.get, { id: "ep-1" })).toMatchObject({ status: "open" });
  });

  it("does not offer while a follow-up is open, and never for the inbox", async () => {
    const t = await withIssue();
    const { epicDone } = await closeIssue(t, "cn-1", 0, {
      followUp: { title: "confirm on a device", kind: "verify" },
    });
    expect(epicDone).toBeUndefined();

    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-0", title: "stray" });
    expect((await closeIssue(t, "cn-3")).epicDone).toBeUndefined();
  });

  /** `from` blocks `to`, the row `cn dep add <to> --blocked-by <from>` writes. */
  const blocks = (t: Harness, from: string, to: string) =>
    t.mutation(api.edges.add, { actor, from, to, type: "blocks" });

  /** `issues.close` with `ran` and the session's `can`, the way `cn close` sends it. */
  const closeWith = (t: Harness, id: string, can: string[]) =>
    t.mutation(api.issues.close, { actor, id, revision: 0, verification: ran, can });

  it("answers the issue it alone held, as a ready row marked with what can cannot satisfy", async () => {
    const held = async () => {
      const t = await seed({ issues: ["the lifecycle"] });
      await t.mutation(api.issues.create, {
        actor,
        project: "cn",
        epic: "ep-1",
        title: "confirm on a device",
        requires: ["ios"],
      });
      await blocks(t, "cn-1", "cn-2");
      return t;
    };

    const t = await held();
    const { madeReady } = await closeWith(t, "cn-1", []);
    expect(madeReady).toHaveLength(1);
    expect(madeReady[0]).toMatchObject({ id: "cn-2", status: "open", cannot: ["ios"] });
    // The row is what the list says, not a second opinion of it.
    expect(await t.query(api.ready.list, { can: [] })).toEqual(madeReady);

    const able = await held();
    expect((await closeWith(able, "cn-1", ["ios"])).madeReady).toMatchObject([
      { id: "cn-2", cannot: [] },
    ]);
  });

  it("answers nothing while another live issue still holds it, and answers it when that one closes", async () => {
    const t = await seed({ issues: ["the lifecycle", "the graph", "the page"] });
    await blocks(t, "cn-1", "cn-3");
    await blocks(t, "cn-2", "cn-3");
    expect((await closeWith(t, "cn-2", [])).madeReady).toEqual([]);
    expect((await closeWith(t, "cn-1", [])).madeReady.map((r) => r.id)).toEqual(["cn-3"]);
  });

  it("answers nothing while a human blocker still holds it", async () => {
    const t = await seed({ issues: ["the lifecycle", "the graph"] });
    await blocks(t, "cn-1", "cn-2");
    await raise(t, "cn-2");
    expect((await closeWith(t, "cn-1", [])).madeReady).toEqual([]);
  });

  it("leaves a claimed issue out, since ready does", async () => {
    const t = await seed({ issues: ["the lifecycle", "the graph"] });
    await blocks(t, "cn-1", "cn-2");
    await t.mutation(api.issues.claim, { actor: other, id: "cn-2" });
    expect((await closeWith(t, "cn-1", [])).madeReady).toEqual([]);
  });
});

describe("issues.drop", () => {
  it("records the reason and the time, and refuses a blank one", async () => {
    const t = await withIssue();
    await expect(
      t.mutation(api.issues.drop, { actor, id: "cn-1", revision: 0, reason: "   " }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "dropping needs a reason" },
    });
    const dropped = await t.mutation(api.issues.drop, {
      actor,
      id: "cn-1",
      revision: 0,
      reason: "the approach it describes is gone",
    });
    expect(dropped).toMatchObject({
      status: "dropped",
      droppedReason: "the approach it describes is gone",
      revision: 1,
    });
    expect(dropped.closedAt).toEqual(expect.any(Number));

    const [event] = await eventsOf(t, "issue.drop");
    expect(event!.changes).toEqual({
      status: { from: "open", to: "dropped" },
      droppedReason: { to: "the approach it describes is gone" },
    });
  });
});
