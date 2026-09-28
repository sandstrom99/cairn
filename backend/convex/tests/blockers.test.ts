// The two halves of a blocker: an agent raises it and an issue leaves `ready` with no
// recompute, and a person — only a person — ends it and every issue it held comes back,
// also with no recompute. The refusals are the interesting half: an agent that could
// resolve its own blocker would resolve nothing, and the guardrail is the whole point
// of the table existing (docs/design.md §6).
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import {
  APPROVAL,
  type Harness,
  actor,
  balder,
  closeIssue,
  eventsOf,
  historyOf,
  raise,
  rows,
  seed,
} from "./test.fixtures";

/** A deployment with one epic and two open issues, cn-1 and cn-2. */
const twoOpen = () => seed({ issues: ["schema and the first verbs", "the lifecycle"] });

const links = (t: Harness) => rows(t, "blockerLinks");

const readyIds = async (t: Harness) => (await t.query(api.ready.list, {})).map((i) => i.id);

describe("blockers.raise", () => {
  it("mints bl-1, links it to the issue and records the raise", async () => {
    const t = await twoOpen();
    const raised = await raise(t, "cn-1");
    expect(raised.blocker).toMatchObject({
      id: "bl-1",
      title: "the App Store agreement",
      blockerKind: "approval",
      owner: "balder",
      whatResolves: "accept it in App Store Connect",
      status: "raised",
      raisedBy: actor,
      revision: 0,
      issues: [{ id: "cn-1", title: "schema and the first verbs" }],
    });
    expect(raised.issue).toEqual({ id: "cn-1", title: "schema and the first verbs" });
    expect(await links(t)).toHaveLength(1);

    const [, event] = await historyOf(t, "cn-1");
    expect(event).toMatchObject({
      kind: "blocker.raise",
      actor,
      changes: { id: "bl-1", blockerKind: "approval", owner: "balder", issue: "cn-1" },
    });
    // The issue's revision did not move, so the event carries none (§9).
    expect(event?.revision).toBeUndefined();
    const shown = await t.query(api.show.get, { id: "cn-1" });
    expect(shown).toMatchObject({ kind: "issue", revision: 0 });
  });

  it("carries a nudge date when one is given", async () => {
    const t = await twoOpen();
    const nudgeAt = Date.UTC(2026, 9, 1);
    const raised = await raise(t, "cn-1", { nudgeAt });
    expect(raised.blocker.nudgeAt).toBe(nudgeAt);
  });

  it("attaches an existing blocker with --on, and twice is once", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    const attached = await t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" });
    expect(attached.blocker.issues.map((i) => i.id)).toEqual(["cn-1", "cn-2"]);
    expect(await links(t)).toHaveLength(2);
    const [, attach] = await historyOf(t, "cn-2");
    expect(attach).toMatchObject({
      kind: "blocker.attach",
      changes: { blocker: "bl-1", issue: "cn-2" },
    });
    expect(attach?.revision).toBeUndefined();

    await t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" });
    expect(await links(t)).toHaveLength(2);
    expect((await historyOf(t, "cn-2")).map((e) => e.kind)).toEqual([
      "issue.create",
      "blocker.attach",
    ]);
  });

  it("refuses a closed issue: a blocker holds live work", async () => {
    const t = await twoOpen();
    await closeIssue(t, "cn-1");
    await expect(raise(t, "cn-1")).rejects.toThrow(/cn-1 is closed; a blocker holds live work/);
  });

  it("refuses --on a resolved blocker, and --on beside the fields that describe a new one", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    await expect(
      t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1", kind: "decision" }),
    ).rejects.toThrow(/--on attaches an existing blocker/);

    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "signed" });
    await expect(
      t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" }),
    ).rejects.toThrow(/bl-1 is resolved; raise a new one/);
  });

  it("names the first field a new blocker is missing", async () => {
    const t = await twoOpen();
    const { owner: _owner, ...noOwner } = APPROVAL;
    await expect(
      t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...noOwner }),
    ).rejects.toThrow(/a new blocker needs --owner/);
    await expect(raise(t, "cn-1", { whatResolves: "  " })).rejects.toThrow(
      /a new blocker needs --resolves/,
    );
  });

  it("stores a link given with a new blocker, and the raise event carries it", async () => {
    const t = await twoOpen();
    const raised = await raise(t, "cn-1", {
      link: [{ url: "https://example.com/options", label: "options" }],
    });
    expect(raised.blocker.links).toEqual([
      { url: "https://example.com/options", label: "options", by: actor, at: expect.any(Number) },
    ]);
    const [event] = await eventsOf(t, "blocker.raise");
    expect(event!.changes).toMatchObject({
      links: [{ url: "https://example.com/options", label: "options" }],
    });
    expect((await raise(t, "cn-2")).blocker.links).toBeUndefined();
  });

  it("refuses a link beside --on, since a link describes a new blocker", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    await expect(
      t.mutation(api.blockers.raise, {
        actor,
        issue: "cn-2",
        on: "bl-1",
        link: [{ url: "https://example.com/x" }],
      }),
    ).rejects.toThrow(/--on attaches an existing blocker/);
  });

  it("takes the issue out of ready and leaves it in list", async () => {
    const t = await twoOpen();
    await raise(t, "cn-2");
    expect(await readyIds(t)).toEqual(["cn-1"]);
    expect((await t.query(api.issues.list, {})).map((i) => i.id)).toEqual(["cn-1", "cn-2"]);
  });
});

describe("blockers.update", () => {
  it("changes the title, what resolves it and the links, on the blocker alone", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    const updated = await t.mutation(api.blockers.update, {
      actor,
      id: "bl-1",
      revision: 0,
      title: "the new App Store agreement",
      whatResolves: "accept it in the browser",
      link: [{ url: "https://example.com/terms" }],
    });
    expect(updated).toMatchObject({
      title: "the new App Store agreement",
      whatResolves: "accept it in the browser",
      links: [{ url: "https://example.com/terms", by: actor }],
      blockerKind: "approval",
      owner: "balder",
      revision: 1,
    });

    const events = await eventsOf(t, "blocker.update");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor, revision: 1, blockerId: expect.any(String) });
    expect(events[0]!.issueId).toBeUndefined();
    expect(events[0]!.changes).toEqual({
      title: { from: "the App Store agreement", to: "the new App Store agreement" },
      whatResolves: { from: "accept it in App Store Connect", to: "accept it in the browser" },
      links: { from: [], to: [{ url: "https://example.com/terms" }] },
    });
    expect((await historyOf(t, "bl-1")).map((e) => e.kind)).toEqual([
      "blocker.raise",
      "blocker.update",
    ]);
  });

  it("rejects a stale revision with the blocker.update since it", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    await t.mutation(api.blockers.update, { actor, id: "bl-1", revision: 0, title: "one" });
    await expect(
      t.mutation(api.blockers.update, { actor, id: "bl-1", revision: 0, title: "two" }),
    ).rejects.toMatchObject({
      data: {
        kind: "stale",
        id: "bl-1",
        yours: 0,
        current: 1,
        since: [{ revision: 1, actor, kind: "blocker.update" }],
      },
    });
  });

  it("refuses a resolved blocker, an empty title and an empty resolves line", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    await expect(
      t.mutation(api.blockers.update, { actor, id: "bl-1", revision: 0, title: " " }),
    ).rejects.toMatchObject({ data: { kind: "invalid", message: "a blocker needs --title" } });
    await expect(
      t.mutation(api.blockers.update, { actor, id: "bl-1", revision: 0, whatResolves: "" }),
    ).rejects.toMatchObject({ data: { kind: "invalid", message: "a blocker needs --resolves" } });
    await expect(
      t.mutation(api.blockers.update, { actor, id: "bl-1", revision: 0 }),
    ).rejects.toMatchObject({ data: { kind: "invalid", message: "nothing to update" } });

    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "signed" });
    await expect(
      t.mutation(api.blockers.update, { actor: balder, id: "bl-1", revision: 1, title: "x" }),
    ).rejects.toThrow(/bl-1 was resolved by wsl\/balder on /);
  });
});

describe("blockers.ack", () => {
  it("refuses an agent by naming who is waited on", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    await expect(t.mutation(api.blockers.ack, { actor, id: "bl-1" })).rejects.toThrow(
      /only a person can acknowledge bl-1; it waits on balder/,
    );
  });

  it("moves raised to waiting once, and records the person who did it", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    const acked = await t.mutation(api.blockers.ack, { actor: balder, id: "bl-1" });
    expect(acked).toMatchObject({ status: "waiting", revision: 1 });

    const again = await t.mutation(api.blockers.ack, { actor: balder, id: "bl-1" });
    expect(again).toMatchObject({ status: "waiting", revision: 1 });

    const events = await historyOf(t, "bl-1");
    expect(events.map((e) => e.kind)).toEqual(["blocker.raise", "blocker.ack"]);
    expect(events.at(-1)).toMatchObject({
      actor: balder,
      revision: 1,
      changes: { status: { from: "raised", to: "waiting" } },
    });
  });

  it("refuses an ack after the blocker is resolved", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "signed" });
    await expect(t.mutation(api.blockers.ack, { actor: balder, id: "bl-1" })).rejects.toThrow(
      /bl-1 was resolved by wsl\/balder on /,
    );
  });
});

describe("blockers.resolve", () => {
  it("frees every issue the blocker held, with nothing run in between", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    await t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" });
    expect(await readyIds(t)).toEqual([]);

    const resolved = await t.mutation(api.blockers.resolve, {
      actor: balder,
      id: "bl-1",
      note: "accepted in App Store Connect",
    });
    expect(await readyIds(t)).toEqual(["cn-1", "cn-2"]);
    expect(resolved).toMatchObject({
      status: "resolved",
      resolvedBy: balder,
      resolution: "accepted in App Store Connect",
      revision: 1,
    });
    expect(resolved.resolvedAt).toBeTypeOf("number");

    for (const id of ["cn-1", "cn-2"]) {
      const freed = (await historyOf(t, id)).at(-1);
      expect(freed).toMatchObject({
        kind: "blocker.resolve",
        actor: balder,
        changes: { blocker: "bl-1", resolution: "accepted in App Store Connect" },
      });
      expect(freed?.revision).toBeUndefined();
    }

    // The two issues named it in their changes, not in `blockerId`, so the blocker's own
    // history is one line per action rather than one per issue it held.
    const events = await historyOf(t, "bl-1");
    expect(events.map((e) => e.kind)).toEqual([
      "blocker.raise",
      "blocker.attach",
      "blocker.resolve",
    ]);
    expect(events.at(-1)).toMatchObject({
      revision: 1,
      // Explicit changes: the computed map would carry the timestamp and the whole actor.
      changes: {
        status: { from: "raised", to: "resolved" },
        resolution: { to: "accepted in App Store Connect" },
      },
    });
  });

  it("refuses an agent, an empty note, and a second resolution", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    await expect(
      t.mutation(api.blockers.resolve, { actor, id: "bl-1", note: "signed" }),
    ).rejects.toThrow(/only a person can resolve bl-1; it waits on balder/);
    await expect(
      t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "   " }),
    ).rejects.toThrow(/a resolution says what happened/);

    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "signed" });
    await expect(
      t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "signed again" }),
    ).rejects.toThrow(/bl-1 was resolved by wsl\/balder on /);
  });
});

describe("blockers.list", () => {
  it("is nothing when nothing waits", async () => {
    const t = await twoOpen();
    expect(await t.query(api.blockers.list, {})).toEqual([]);
  });

  it("puts raised before acknowledged, oldest first, and never the resolved", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    await raise(t, "cn-2", { title: "the DUNS number" });
    await raise(t, "cn-2", { kind: "purchase", title: "the paid developer account" });
    // bl-1 acknowledged: seen work sorts under unseen work whatever its age.
    await t.mutation(api.blockers.ack, { actor: balder, id: "bl-1" });
    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-3", note: "bought" });

    const waiting = await t.query(api.blockers.list, {});
    expect(waiting.map((b) => [b.id, b.status])).toEqual([
      ["bl-2", "raised"],
      ["bl-1", "waiting"],
    ]);
    expect(waiting[1]?.issues).toEqual([{ id: "cn-1", title: "schema and the first verbs" }]);
  });
});

describe("show.get on a blocker", () => {
  it("is the full view with what it holds, and its events when asked", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    const shown = await t.query(api.show.get, { id: "bl-1" });
    expect(shown).toMatchObject({
      kind: "blocker",
      id: "bl-1",
      blockerKind: "approval",
      owner: "balder",
      whatResolves: "accept it in App Store Connect",
      status: "raised",
      raisedBy: actor,
      issues: [{ id: "cn-1", title: "schema and the first verbs" }],
    });
    if (shown.kind !== "blocker") throw new Error("bl-1 is a blocker");
    expect(shown.events).toBeUndefined();
    expect((await historyOf(t, "bl-1")).map((e) => e.kind)).toEqual(["blocker.raise"]);
  });

  it("lists the blocker under the issue's waitingOn until it resolves", async () => {
    const t = await twoOpen();
    await raise(t, "cn-1");
    const before = await t.query(api.show.get, { id: "cn-1" });
    expect(before).toMatchObject({
      waitingOn: [{ id: "bl-1", title: "the App Store agreement" }],
    });

    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "signed" });
    expect(await t.query(api.show.get, { id: "cn-1" })).toMatchObject({ waitingOn: [] });
  });
});
