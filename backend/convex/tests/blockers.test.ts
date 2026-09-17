// The two halves of a blocker: an agent raises it and an issue leaves `ready` with no
// recompute, and a person — only a person — ends it and every issue it held comes back,
// also with no recompute. The refusals are the interesting half: an agent that could
// resolve its own blocker would resolve nothing, and the guardrail is the whole point
// of the table existing (docs/design.md §6).
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const balder = { name: "wsl/balder", kind: "human" } as const;
const modules = import.meta.glob("../**/*.ts");

/** A deployment with one epic and two open issues, cn-1 and cn-2. */
async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
  await t.mutation(api.epics.create, { actor, title: "Create to close" });
  for (const title of ["schema and the first verbs", "the lifecycle"])
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title });
  return t;
}

type Harness = Awaited<ReturnType<typeof seeded>>;

const NEW = {
  kind: "approval",
  owner: "balder",
  title: "the App Store agreement",
  whatResolves: "accept it in App Store Connect",
} as const;

const links = (t: Harness) => t.run((ctx) => ctx.db.query("blockerLinks").collect());

const readyIds = async (t: Harness) => (await t.query(api.ready.list, {})).map((i) => i.id);

/** Every event on an issue, oldest first. */
const events = async (t: Harness, id: string) => {
  const shown = await t.query(api.show.get, { id, history: true });
  if (shown.kind !== "issue") throw new Error(`${id} is an issue`);
  return shown.events ?? [];
};

describe("blockers.raise", () => {
  it("mints bl-1, links it to the issue and records the raise", async () => {
    const t = await seeded();
    const raised = await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
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

    const [, raise] = await events(t, "cn-1");
    expect(raise).toMatchObject({
      kind: "blocker.raise",
      actor,
      changes: { id: "bl-1", blockerKind: "approval", owner: "balder", issue: "cn-1" },
    });
    // The issue's revision did not move, so the event carries none (§9).
    expect(raise?.revision).toBeUndefined();
    const shown = await t.query(api.show.get, { id: "cn-1" });
    expect(shown).toMatchObject({ kind: "issue", revision: 0 });
  });

  it("carries a nudge date when one is given", async () => {
    const t = await seeded();
    const at = Date.UTC(2026, 9, 1);
    const raised = await t.mutation(api.blockers.raise, {
      actor,
      issue: "cn-1",
      ...NEW,
      nudgeAt: at,
    });
    expect(raised.blocker.nudgeAt).toBe(at);
  });

  it("attaches an existing blocker with --on, and twice is once", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
    const attached = await t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" });
    expect(attached.blocker.issues.map((i) => i.id)).toEqual(["cn-1", "cn-2"]);
    expect(await links(t)).toHaveLength(2);
    const [, attach] = await events(t, "cn-2");
    expect(attach).toMatchObject({
      kind: "blocker.attach",
      changes: { blocker: "bl-1", issue: "cn-2" },
    });
    expect(attach?.revision).toBeUndefined();

    await t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" });
    expect(await links(t)).toHaveLength(2);
    expect((await events(t, "cn-2")).map((e) => e.kind)).toEqual([
      "issue.create",
      "blocker.attach",
    ]);
  });

  it("refuses a closed issue: a blocker holds live work", async () => {
    const t = await seeded();
    await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 0,
      verification: { command: "vp run verify", exitCode: 0, output: "pass" },
    });
    await expect(t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW })).rejects.toThrow(
      /cn-1 is closed; a blocker holds live work/,
    );
  });

  it("refuses --on a resolved blocker, and --on beside the fields that describe a new one", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
    await expect(
      t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1", kind: "decision" }),
    ).rejects.toThrow(/--on attaches an existing blocker/);

    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "signed" });
    await expect(
      t.mutation(api.blockers.raise, { actor, issue: "cn-2", on: "bl-1" }),
    ).rejects.toThrow(/bl-1 is resolved; raise a new one/);
  });

  it("names the first field a new blocker is missing", async () => {
    const t = await seeded();
    const { owner: _owner, ...noOwner } = NEW;
    await expect(
      t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...noOwner }),
    ).rejects.toThrow(/a new blocker needs --owner/);
    await expect(
      t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW, whatResolves: "  " }),
    ).rejects.toThrow(/a new blocker needs --resolves/);
  });

  it("takes the issue out of ready and leaves it in list", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-2", ...NEW });
    expect(await readyIds(t)).toEqual(["cn-1"]);
    expect((await t.query(api.issues.list, {})).map((i) => i.id)).toEqual(["cn-1", "cn-2"]);
  });
});

describe("blockers.ack", () => {
  it("refuses an agent by naming who is waited on", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
    await expect(t.mutation(api.blockers.ack, { actor, id: "bl-1" })).rejects.toThrow(
      /only a person can acknowledge bl-1; it waits on balder/,
    );
  });

  it("moves raised to waiting once, and records the person who did it", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
    const acked = await t.mutation(api.blockers.ack, { actor: balder, id: "bl-1" });
    expect(acked).toMatchObject({ status: "waiting", revision: 1 });

    const again = await t.mutation(api.blockers.ack, { actor: balder, id: "bl-1" });
    expect(again).toMatchObject({ status: "waiting", revision: 1 });

    const shown = await t.query(api.show.get, { id: "bl-1", history: true });
    if (shown.kind !== "blocker") throw new Error("bl-1 is a blocker");
    expect(shown.events?.map((e) => e.kind)).toEqual(["blocker.raise", "blocker.ack"]);
    expect(shown.events?.at(-1)).toMatchObject({
      actor: balder,
      revision: 1,
      changes: { status: { from: "raised", to: "waiting" } },
    });
  });

  it("refuses an ack after the blocker is resolved", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "signed" });
    await expect(t.mutation(api.blockers.ack, { actor: balder, id: "bl-1" })).rejects.toThrow(
      /bl-1 was resolved by wsl\/balder on /,
    );
  });
});

describe("blockers.resolve", () => {
  it("frees every issue the blocker held, with nothing run in between", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
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
      const freed = (await events(t, id)).at(-1);
      expect(freed).toMatchObject({
        kind: "blocker.resolve",
        actor: balder,
        changes: { blocker: "bl-1", resolution: "accepted in App Store Connect" },
      });
      expect(freed?.revision).toBeUndefined();
    }

    // The two issues named it in their changes, not in `blockerId`, so the blocker's own
    // history is one line per action rather than one per issue it held.
    const shown = await t.query(api.show.get, { id: "bl-1", history: true });
    if (shown.kind !== "blocker") throw new Error("bl-1 is a blocker");
    expect(shown.events?.map((e) => e.kind)).toEqual([
      "blocker.raise",
      "blocker.attach",
      "blocker.resolve",
    ]);
    expect(shown.events?.at(-1)).toMatchObject({
      revision: 1,
      // Explicit changes: the computed map would carry the timestamp and the whole actor.
      changes: {
        status: { from: "raised", to: "resolved" },
        resolution: { to: "accepted in App Store Connect" },
      },
    });
  });

  it("refuses an agent, an empty note, and a second resolution", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
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
    const t = await seeded();
    expect(await t.query(api.blockers.list, {})).toEqual([]);
  });

  it("puts raised before acknowledged, oldest first, and never the resolved", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
    await t.mutation(api.blockers.raise, {
      actor,
      issue: "cn-2",
      ...NEW,
      title: "the DUNS number",
    });
    await t.mutation(api.blockers.raise, {
      actor,
      issue: "cn-2",
      ...NEW,
      kind: "purchase",
      title: "the paid developer account",
    });
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
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
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

    const withHistory = await t.query(api.show.get, { id: "bl-1", history: true });
    if (withHistory.kind !== "blocker") throw new Error("bl-1 is a blocker");
    expect(withHistory.events?.map((e) => e.kind)).toEqual(["blocker.raise"]);
  });

  it("lists the blocker under the issue's waitingOn until it resolves", async () => {
    const t = await seeded();
    await t.mutation(api.blockers.raise, { actor, issue: "cn-1", ...NEW });
    const before = await t.query(api.show.get, { id: "cn-1" });
    expect(before).toMatchObject({
      waitingOn: [{ id: "bl-1", title: "the App Store agreement" }],
    });

    await t.mutation(api.blockers.resolve, { actor: balder, id: "bl-1", note: "signed" });
    expect(await t.query(api.show.get, { id: "cn-1" })).toMatchObject({ waitingOn: [] });
  });
});
