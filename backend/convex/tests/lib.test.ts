// The mechanism under the functions: ids minted from counters, the inbox created once,
// and the revision check that makes a stale write something an agent can act on rather
// than a failure a human is paged for (docs/design.md §9).
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { mint } from "../lib/ids";
import { ensureInbox } from "../lib/inbox";
import { applyRevision, expectRevision } from "../lib/revision";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const other = { name: "wsl/balder", kind: "human" } as const;
const modules = import.meta.glob("../**/*.ts");

describe("mint", () => {
  it("starts at 1 per key and counts up", async () => {
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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

describe("revision", () => {
  async function seeded() {
    const t = convexTest(schema, modules);
    await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
    await t.mutation(api.epics.create, { actor, title: "Create to close" });
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "one" });
    return t;
  }

  const issueDoc = (ctx: MutationCtx) =>
    ctx.db
      .query("issues")
      .withIndex("by_public_id", (q) => q.eq("id", "cn-1"))
      .unique();

  it("bumps the revision by one and records what changed", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      const doc = (await issueDoc(ctx))!;
      const revision = await applyRevision(
        ctx,
        { table: "issues", doc },
        { priority: 0, title: "one, urgently" },
        { kind: "issue.update", actor },
      );
      expect(revision).toBe(1);
      const after = (await issueDoc(ctx))!;
      expect(after.revision).toBe(1);
      expect(after.priority).toBe(0);
    });
    const events = await t.run((ctx) =>
      ctx.db
        .query("events")
        .filter((q) => q.eq(q.field("kind"), "issue.update"))
        .collect(),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor,
      revision: 1,
      changes: { priority: { from: 2, to: 0 }, title: { from: "one", to: "one, urgently" } },
    });
  });

  it("returns when the writer read the current revision", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      const doc = (await issueDoc(ctx))!;
      await expect(expectRevision(ctx, { table: "issues", doc }, 0)).resolves.toBeUndefined();
    });
  });

  it("rejects a stale write with every change since, and who made it", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      const doc = (await issueDoc(ctx))!;
      await applyRevision(
        ctx,
        { table: "issues", doc },
        { priority: 0 },
        { kind: "issue.update", actor: other },
      );
    });
    await t.run(async (ctx) => {
      const doc = (await issueDoc(ctx))!;
      await applyRevision(
        ctx,
        { table: "issues", doc },
        { status: "in_progress" },
        { kind: "issue.claim", actor },
      );
    });
    await t.run(async (ctx) => {
      const doc = (await issueDoc(ctx))!;
      await expect(expectRevision(ctx, { table: "issues", doc }, 0)).rejects.toMatchObject({
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
              actor: other,
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
      });
    });
  });

  it("reads an epic's history through its own index", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      const doc = (await ctx.db
        .query("epics")
        .withIndex("by_public_id", (q) => q.eq("id", "ep-1"))
        .unique())!;
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
