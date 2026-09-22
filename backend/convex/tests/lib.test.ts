// The mechanism under the functions: ids minted from counters, the inbox created once,
// and the revision check that makes a stale write something an agent can act on rather
// than a failure a human is paged for (docs/design.md §9). These reach `ctx.db` through
// `t.run` because the helpers under test take a ctx; nothing here fabricates a state.
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { claimChanges, closeChanges, dropChanges, releaseChanges } from "../lib/changes";
import { mint } from "../lib/ids";
import { ensureInbox } from "../lib/inbox";
import { idOrder, priorityOrder } from "../lib/order";
import { checkPriority } from "../lib/priority";
import { applyRevision, expectRevision } from "../lib/revision";
import { isLive } from "../lib/validators";
import { actor, balder, eventsOf, fresh, rawIssue, rows, seed } from "./test.fixtures";

/** A deployment with cn-1 "one", open at revision 0. */
const withOne = () => seed({ issues: ["one"] });

describe("mint", () => {
  it("starts at 1 per key and counts up", async () => {
    const t = fresh();
    await t.run(async (ctx) => {
      expect(await mint(ctx, "cn")).toBe(1);
      expect(await mint(ctx, "cn")).toBe(2);
      expect(await mint(ctx, "ep")).toBe(1);
      expect(await mint(ctx, "cn")).toBe(3);
    });
  });
});

describe("ensureInbox", () => {
  it("creates ep-0 once and returns the same epic after", async () => {
    const t = fresh();
    await t.run(async (ctx) => {
      const first = await ensureInbox(ctx, { name: "t/test", kind: "human" });
      const second = await ensureInbox(ctx, { name: "t/test", kind: "human" });
      expect(first.id).toBe("ep-0");
      expect(first.title).toBe("Inbox");
      expect(second._id).toEqual(first._id);
      expect(await ctx.db.query("epics").collect()).toHaveLength(1);
      expect(await ctx.db.query("counters").collect()).toHaveLength(0);
    });
  });
});

describe("order", () => {
  it("idOrder sorts by slug, then by the number minted", () => {
    const ids = ["cn-10", "cn-2", "app-1", "ep-0"].map((id) => ({ id }));
    expect(ids.sort(idOrder).map((d) => d.id)).toEqual(["app-1", "cn-2", "cn-10", "ep-0"]);
  });

  it("priorityOrder puts the lower priority first, and at equal priority the older", () => {
    const rows = [
      { name: "new p1", priority: 1, _creationTime: 30 },
      { name: "p2", priority: 2, _creationTime: 10 },
      { name: "old p1", priority: 1, _creationTime: 20 },
      { name: "p0", priority: 0, _creationTime: 40 },
    ];
    expect(rows.sort(priorityOrder).map((r) => r.name)).toEqual(["p0", "old p1", "new p1", "p2"]);
  });
});

describe("isLive", () => {
  it("is true for open and in_progress, false for closed and dropped", () => {
    expect(isLive({ status: "open" })).toBe(true);
    expect(isLive({ status: "in_progress" })).toBe(true);
    expect(isLive({ status: "closed" })).toBe(false);
    expect(isLive({ status: "dropped" })).toBe(false);
  });
});

describe("checkPriority", () => {
  it("returns 0 and 4 as they are", () => {
    expect(checkPriority(0)).toBe(0);
    expect(checkPriority(4)).toBe(4);
  });

  it("refuses 5, -1 and 2.5 as invalid", () => {
    for (const priority of [5, -1, 2.5]) {
      let thrown: unknown;
      try {
        checkPriority(priority);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(ConvexError);
      expect(thrown).toMatchObject({ data: { kind: "invalid" } });
    }
  });
});

describe("changes", () => {
  it("claimChanges moves status open to in_progress and names the claimer", async () => {
    const t = await withOne();
    const doc = await rawIssue(t, "cn-1");
    expect(claimChanges(doc, actor)).toEqual({
      status: { from: "open", to: "in_progress" },
      claimedBy: { to: actor.name },
    });
  });

  it("releaseChanges names who held it, and omits claimedBy when nobody did", async () => {
    const t = await withOne();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    const held = await rawIssue(t, "cn-1");
    expect(releaseChanges(held)).toEqual({
      status: { from: "in_progress", to: "open" },
      claimedBy: { from: actor.name },
    });

    await t.mutation(api.issues.release, { actor, id: "cn-1" });
    const unclaimed = await rawIssue(t, "cn-1");
    const result = releaseChanges(unclaimed);
    expect(result).toEqual({ status: { from: "open", to: "open" } });
    expect("claimedBy" in result).toBe(false);
  });

  it("closeChanges summarises a command's exit code, and an unverified reason", async () => {
    const t = await withOne();
    const doc = await rawIssue(t, "cn-1");
    expect(closeChanges(doc, { command: "vp run verify", exitCode: 0, output: "ok" })).toEqual({
      status: { from: "open", to: "closed" },
      verification: { to: "vp run verify (exit 0)" },
    });
    expect(closeChanges(doc, { unverified: "ran on the mac" })).toEqual({
      status: { from: "open", to: "closed" },
      verification: { to: "unverified: ran on the mac" },
    });
  });

  it("dropChanges names the reason", async () => {
    const t = await withOne();
    const doc = await rawIssue(t, "cn-1");
    expect(dropChanges(doc, "not going to happen")).toEqual({
      status: { from: "open", to: "dropped" },
      droppedReason: { to: "not going to happen" },
    });
  });
});

describe("revision", () => {
  it("bumps the revision by one and records what changed", async () => {
    const t = await withOne();
    const doc = await rawIssue(t, "cn-1");
    const revision = await t.run((ctx) =>
      applyRevision(
        ctx,
        { table: "issues", doc },
        { priority: 0, title: "one, urgently" },
        { kind: "issue.update", actor },
      ),
    );
    expect(revision).toBe(1);
    const after = await rawIssue(t, "cn-1");
    expect(after.revision).toBe(1);
    expect(after.priority).toBe(0);
    const events = await eventsOf(t, "issue.update");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor,
      revision: 1,
      changes: { priority: { from: 2, to: 0 }, title: { from: "one", to: "one, urgently" } },
    });
  });

  it("returns when the writer read the current revision", async () => {
    const t = await withOne();
    const doc = await rawIssue(t, "cn-1");
    await t.run(async (ctx) => {
      await expect(expectRevision(ctx, { table: "issues", doc }, 0)).resolves.toBeUndefined();
    });
  });

  it("rejects a stale write with every change since, and who made it", async () => {
    const t = await withOne();
    const first = await rawIssue(t, "cn-1");
    await t.run((ctx) =>
      applyRevision(
        ctx,
        { table: "issues", doc: first },
        { priority: 0 },
        { kind: "issue.update", actor: balder },
      ),
    );
    const second = await rawIssue(t, "cn-1");
    await t.run((ctx) =>
      applyRevision(
        ctx,
        { table: "issues", doc: second },
        { status: "in_progress" },
        { kind: "issue.claim", actor },
      ),
    );
    const current = await rawIssue(t, "cn-1");
    await t.run(async (ctx) => {
      await expect(expectRevision(ctx, { table: "issues", doc: current }, 0)).rejects.toMatchObject(
        {
          data: {
            kind: "stale",
            message: "cn-1 is at revision 2, you read 0",
            id: "cn-1",
            yours: 0,
            current: 2,
            since: [
              {
                revision: 1,
                kind: "issue.update",
                actor: balder,
                at: expect.any(Number),
                changes: { priority: { from: 2, to: 0 } },
              },
              {
                revision: 2,
                kind: "issue.claim",
                actor,
                at: expect.any(Number),
                changes: { status: { from: "open", to: "in_progress" } },
              },
            ],
          },
        },
      );
    });
  });

  it("reads an epic's history through its own index", async () => {
    const t = await withOne();
    const doc = (await rows(t, "epics")).find((e) => e.id === "ep-1")!;
    await t.run(async (ctx) => {
      await applyRevision(
        ctx,
        { table: "epics", doc },
        { title: "Create to close, with evidence" },
        { kind: "epic.update", actor },
      );
      const after = (await ctx.db.get(doc._id))!;
      await expect(expectRevision(ctx, { table: "epics", doc: after }, 0)).rejects.toMatchObject({
        data: { kind: "stale", current: 1, since: [{ revision: 1, kind: "epic.update" }] },
      });
    });
  });
});
