// The mechanism under the functions: ids minted from counters, the inbox created once,
// one helper per lifecycle move and what its event records, and the revision check that
// makes a stale write something an agent can act on rather than a failure a human is
// paged for (docs/design.md §9). These reach `ctx.db` through
// `t.run` because the helpers under test take a ctx; nothing here fabricates a state.
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventsOn, issuesHeldBy, unresolvedBlockersOn } from "../lib/graph";
import { mint } from "../lib/ids";
import { ensureInbox } from "../lib/inbox";
import {
  ackBlocker,
  claimIssue,
  closeEpic,
  closeIssue,
  dropEpic,
  dropIssue,
  editIssue,
  insertEpic,
  insertIssue,
  moveIssue,
  releaseIssue,
  resolveBlocker,
} from "../lib/lifecycle";
import { projectBySlug } from "../lib/lookup";
import { idOrder, priorityOrder } from "../lib/order";
import { checkPriority } from "../lib/priority";
import { applyRevision, expectRevision } from "../lib/revision";
import { isLive } from "../lib/validators";
import { epicView } from "../lib/views";
import {
  APPROVAL,
  type Harness,
  actor,
  balder,
  eventsOf,
  fresh,
  raise,
  rawIssue,
  rows,
  seed,
} from "./test.fixtures";

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

/** An epic as it stands in the table. */
const rawEpic = async (t: Harness, id: string) =>
  (await rows(t, "epics")).find((e) => e.id === id)!;

/** A blocker as it stands in the table. */
const rawBlocker = async (t: Harness, id: string) =>
  (await rows(t, "blockers")).find((b) => b.id === id)!;

/** The `changes` of the newest event of a kind. */
const lastChanges = async (t: Harness, kind: string) => (await eventsOf(t, kind)).at(-1)!.changes;

describe("lifecycle", () => {
  it("insertIssue mints cn-2 after cn-1 and records the view minus createdAt", async () => {
    const t = await withOne();
    const epic = await rawEpic(t, "ep-1");
    const view = await t.run(async (ctx) =>
      insertIssue(ctx, actor, {
        project: await projectBySlug(ctx, "cn"),
        epicId: epic._id,
        title: "two",
        type: "task",
        links: [],
        priority: 2,
      }),
    );
    expect(view.id).toBe("cn-2");
    expect(view).toMatchObject({ status: "open", revision: 0, epic: { id: "ep-1" } });
    const events = await eventsOf(t, "issue.create");
    expect(events).toHaveLength(2);
    const { createdAt: _, ...rest } = view;
    expect(events[1]).toMatchObject({ actor, revision: 0, epicId: epic._id });
    expect(events[1]!.changes).toEqual(rest);
    expect("createdAt" in (events[1]!.changes as object)).toBe(false);
  });

  it("insertEpic returns the row open at revision 0, and its event carries revision 0", async () => {
    const t = fresh();
    const doc = await t.run((ctx) => insertEpic(ctx, actor, { id: "ep-7", title: "Seven" }));
    expect(doc).toMatchObject({ id: "ep-7", title: "Seven", status: "open", revision: 0 });
    expect("description" in doc).toBe(false);
    const events = await eventsOf(t, "epic.create");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor, epicId: doc._id, revision: 0 });
    const { createdAt: _, ...rest } = epicView(doc, []);
    expect(events[0]!.changes).toEqual(rest);
  });

  it("claimIssue returns the doc in_progress and records the status and the claimer's name", async () => {
    const t = await withOne();
    const doc = await rawIssue(t, "cn-1");
    const claimed = await t.run((ctx) => claimIssue(ctx, actor, doc));
    expect(claimed).toMatchObject({ status: "in_progress", claimedBy: actor, revision: 1 });
    expect(await lastChanges(t, "issue.claim")).toEqual({
      status: { from: "open", to: "in_progress" },
      claimedBy: { to: actor.name },
    });
  });

  it("releaseIssue names who held it, and omits claimedBy when nobody did", async () => {
    const t = await withOne();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    const held = await rawIssue(t, "cn-1");
    const released = await t.run((ctx) => releaseIssue(ctx, balder, held));
    expect(released.status).toBe("open");
    expect(released.claimedBy).toBeUndefined();
    expect(await lastChanges(t, "issue.release")).toEqual({
      status: { from: "in_progress", to: "open" },
      claimedBy: { from: actor.name },
    });

    const unclaimed = await rawIssue(t, "cn-1");
    await t.run((ctx) => releaseIssue(ctx, balder, unclaimed));
    const changes = await lastChanges(t, "issue.release");
    expect(changes).toEqual({ status: { from: "open", to: "open" } });
    expect("claimedBy" in (changes as object)).toBe(false);
  });

  it("closeIssue records a command's exit code, and an unverified reason", async () => {
    const t = await seed({ issues: ["one", "two"] });
    const one = await rawIssue(t, "cn-1");
    const closed = await t.run((ctx) =>
      closeIssue(ctx, actor, one, { command: "vp run verify", exitCode: 0, output: "ok" }),
    );
    expect(closed).toMatchObject({ status: "closed", verification: { exitCode: 0, by: actor } });
    expect(await lastChanges(t, "issue.close")).toEqual({
      status: { from: "open", to: "closed" },
      verification: { to: "vp run verify (exit 0)" },
    });

    const two = await rawIssue(t, "cn-2");
    await t.run((ctx) => closeIssue(ctx, actor, two, { unverified: "ran on the mac" }));
    expect(await lastChanges(t, "issue.close")).toEqual({
      status: { from: "open", to: "closed" },
      verification: { to: "unverified: ran on the mac" },
    });
  });

  it("dropIssue records the reason", async () => {
    const t = await withOne();
    const doc = await rawIssue(t, "cn-1");
    const dropped = await t.run((ctx) => dropIssue(ctx, actor, doc, "not going to happen"));
    expect(dropped).toMatchObject({ status: "dropped", droppedReason: "not going to happen" });
    expect(await lastChanges(t, "issue.drop")).toEqual({
      status: { from: "open", to: "dropped" },
      droppedReason: { to: "not going to happen" },
    });
  });

  it("editIssue refuses an empty edit, and records each field and the epic as two public ids", async () => {
    const t = await withOne();
    await t.mutation(api.epics.create, { actor, title: "Second" });
    const doc = await rawIssue(t, "cn-1");
    await t.run(async (ctx) => {
      await expect(editIssue(ctx, actor, doc, {})).rejects.toMatchObject({
        data: { kind: "invalid", message: "nothing to update" },
      });
    });

    const ep2 = await rawEpic(t, "ep-2");
    const edited = await t.run((ctx) =>
      editIssue(ctx, actor, doc, { title: "one, moved", deferUntil: null, epic: ep2 }),
    );
    expect(edited).toMatchObject({ title: "one, moved", epicId: ep2._id, revision: 1 });
    expect(await lastChanges(t, "issue.update")).toEqual({
      title: { from: "one", to: "one, moved" },
      deferUntil: { from: null, to: null },
      epic: { from: "ep-1", to: "ep-2" },
    });
  });

  it("moveIssue is the one-field edit of the epic", async () => {
    const t = await withOne();
    await t.mutation(api.epics.create, { actor, title: "Second" });
    const doc = await rawIssue(t, "cn-1");
    const ep2 = await rawEpic(t, "ep-2");
    const moved = await t.run((ctx) => moveIssue(ctx, actor, doc, ep2));
    expect(moved.epicId).toEqual(ep2._id);
    expect(await lastChanges(t, "issue.update")).toEqual({ epic: { from: "ep-1", to: "ep-2" } });
  });

  it("closeEpic and dropEpic record their status maps, the drop with its reason", async () => {
    const t = await seed();
    await t.mutation(api.epics.create, { actor, title: "Second" });
    const ep1 = await rawEpic(t, "ep-1");
    const closed = await t.run((ctx) => closeEpic(ctx, actor, ep1));
    expect(closed).toMatchObject({ status: "closed", revision: 1 });
    expect(await lastChanges(t, "epic.close")).toEqual({
      status: { from: "open", to: "closed" },
    });

    const ep2 = await rawEpic(t, "ep-2");
    const dropped = await t.run((ctx) => dropEpic(ctx, actor, ep2, "not shipping"));
    expect(dropped).toMatchObject({ status: "dropped", droppedReason: "not shipping" });
    expect(await lastChanges(t, "epic.drop")).toEqual({
      status: { from: "open", to: "dropped" },
      droppedReason: { to: "not shipping" },
    });
  });

  it("ackBlocker records raised to waiting", async () => {
    const t = await withOne();
    await raise(t, "cn-1");
    const doc = await rawBlocker(t, "bl-1");
    const acked = await t.run((ctx) => ackBlocker(ctx, balder, doc));
    expect(acked).toMatchObject({ status: "waiting", revision: 1 });
    expect(await lastChanges(t, "blocker.ack")).toEqual({
      status: { from: "raised", to: "waiting" },
    });
  });

  it("resolveBlocker records the note on the blocker, and one event per issue it held", async () => {
    const t = await seed({ issues: ["one", "two"] });
    await raise(t, "cn-1");
    await t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" });
    const doc = await rawBlocker(t, "bl-1");
    const resolved = await t.run((ctx) => resolveBlocker(ctx, balder, doc, "accepted"));
    expect(resolved).toMatchObject({ status: "resolved", resolution: "accepted", revision: 1 });

    const events = await eventsOf(t, "blocker.resolve");
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ blockerId: doc._id, revision: 1 });
    expect(events[0]!.changes).toEqual({
      status: { from: "raised", to: "resolved" },
      resolution: { to: "accepted" },
    });
    const one = await rawIssue(t, "cn-1");
    const two = await rawIssue(t, "cn-2");
    const held = { blocker: "bl-1", title: APPROVAL.title, resolution: "accepted" };
    expect(events.slice(1).map((e) => [e.issueId, e.revision, e.changes])).toEqual([
      [one._id, undefined, held],
      [two._id, undefined, held],
    ]);
  });
});

describe("revision", () => {
  it("bumps the revision by one, returns the patched doc and records the changes given", async () => {
    const t = await withOne();
    const doc = await rawIssue(t, "cn-1");
    const returned = await t.run((ctx) =>
      applyRevision(
        ctx,
        { table: "issues", doc },
        { priority: 0, title: "one, urgently" },
        {
          kind: "issue.update",
          actor,
          changes: { priority: { from: 2, to: 0 }, title: { from: "one", to: "one, urgently" } },
        },
      ),
    );
    expect(returned).toMatchObject({ revision: 1, priority: 0, title: "one, urgently" });
    const after = await rawIssue(t, "cn-1");
    expect(after).toEqual(returned);
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
        { kind: "issue.update", actor: balder, changes: { priority: { from: 2, to: 0 } } },
      ),
    );
    const second = await rawIssue(t, "cn-1");
    await t.run((ctx) =>
      applyRevision(
        ctx,
        { table: "issues", doc: second },
        { status: "in_progress" },
        {
          kind: "issue.claim",
          actor,
          changes: { status: { from: "open", to: "in_progress" } },
        },
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
        { status: "closed" },
        { kind: "epic.close", actor, changes: { status: { from: "open", to: "closed" } } },
      );
      const after = (await ctx.db.get(doc._id))!;
      await expect(expectRevision(ctx, { table: "epics", doc: after }, 0)).rejects.toMatchObject({
        data: { kind: "stale", current: 1, since: [{ revision: 1, kind: "epic.close" }] },
      });
    });
  });

  it("refuses a misspelt field at the type, which no test can run into", () => {
    // Never called: it exists to be type-checked, and `vp check` fails on the directive
    // the day the misspelling stops being an error.
    const _misspelt = (ctx: MutationCtx, doc: Doc<"issues">) =>
      applyRevision(
        ctx,
        { table: "issues", doc },
        // @ts-expect-error a misspelt field is refused by the type, which is the point
        { statsu: "open" },
        { kind: "issue.update", actor, changes: {} },
      );
    expect(typeof _misspelt).toBe("function");
  });
});

describe("graph", () => {
  it("eventsOn reads an issue's events oldest first, the unrevisioned append among them", async () => {
    const t = await withOne();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    await t.mutation(api.journal.append, { actor, id: "cn-1", kind: "finding", body: "a finding" });
    const doc = await rawIssue(t, "cn-1");
    const events = await t.run((ctx) => eventsOn(ctx, { table: "issues", doc }));
    expect(events.map((e) => e.kind)).toEqual(["issue.create", "issue.claim", "journal.append"]);
    const times = events.map((e) => e._creationTime);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("eventsOn reads an epic's events through its own index", async () => {
    const t = await seed();
    const doc = (await rows(t, "epics")).find((e) => e.id === "ep-1")!;
    const events = await t.run((ctx) => eventsOn(ctx, { table: "epics", doc }));
    expect(events.map((e) => e.kind)).toEqual(["epic.create"]);
  });

  it("unresolvedBlockersOn drops a resolved blocker, and issuesHeldBy still names its issue", async () => {
    const t = await withOne();
    await raise(t, "cn-1");
    await raise(t, "cn-1", { title: "the Play Console agreement" });
    const issue = await rawIssue(t, "cn-1");
    const bl1 = (await rows(t, "blockers")).find((b) => b.id === "bl-1")!;
    const read = () =>
      t.run(async (ctx) => ({
        on: (await unresolvedBlockersOn(ctx, issue._id)).map((b) => b.id),
        held: (await issuesHeldBy(ctx, bl1._id)).map((i) => i.id),
      }));

    expect(await read()).toEqual({ on: ["bl-1", "bl-2"], held: ["cn-1"] });
    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "accepted" });
    expect(await read()).toEqual({ on: ["bl-2"], held: ["cn-1"] });
  });

  it("epicView over no issues counts nothing, and a dropped epic carries its reason", async () => {
    const t = await withOne();
    const doc = (await rows(t, "epics")).find((e) => e.id === "ep-1")!;
    const view = epicView(doc, []);
    expect(view.counts).toEqual({ open: 0, inProgress: 0, closed: 0, dropped: 0, followUps: 0 });
    expect(view.droppedReason).toBeUndefined();

    await t.mutation(api.epics.close, {
      actor,
      id: "ep-1",
      revision: 0,
      drop: true,
      reason: "not shipping",
    });
    const listed = await t.query(api.epics.list, { all: true });
    expect(listed.find((e) => e.id === "ep-1")?.droppedReason).toBe("not shipping");
  });
});
