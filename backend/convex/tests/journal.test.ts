// An append is an insert: it takes no revision, bumps none, and therefore always lands.
// That is the guarantee the beads `--append-notes` bug broke, where 3 of 16 writes
// disappeared under load, and it is why a finding is never a field that gets rewritten.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const other = { name: "mac/claude", kind: "agent" } as const;
const modules = import.meta.glob("../**/*.ts");

/** A deployment with cn-1, open at revision 0. */
async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
  await t.mutation(api.epics.create, { actor, title: "Create to close" });
  await t.mutation(api.issues.create, {
    actor,
    project: "cn",
    epic: "ep-1",
    title: "the lifecycle, claim to close with evidence",
    priority: 0,
  });
  return t;
}

const raw = (t: Awaited<ReturnType<typeof seeded>>) =>
  t.run((ctx) =>
    ctx.db
      .query("issues")
      .withIndex("by_public_id", (q) => q.eq("id", "cn-1"))
      .unique(),
  );

describe("journal.append", () => {
  it("lands while another actor holds a newer revision, without moving it", async () => {
    const t = await seeded();
    await t.mutation(api.issues.claim, { actor: other, id: "cn-1" });
    const before = await raw(t);
    await t.run((ctx) => ctx.db.patch(before!._id, { lastActivity: 0 }));

    const entry = await t.mutation(api.journal.append, {
      actor,
      id: "cn-1",
      kind: "finding",
      body: "the counter row is created on first use",
    });
    expect(entry).toMatchObject({
      id: "cn-1",
      kind: "finding",
      body: "the counter row is created on first use",
      author: actor,
      at: expect.any(Number),
    });

    const after = await raw(t);
    expect(after!.revision).toBe(before!.revision);
    expect(after!.lastActivity).toBeGreaterThan(0);
  });

  it("records an event with no revision and the head of the body", async () => {
    const t = await seeded();
    const body = "e".repeat(120);
    await t.mutation(api.journal.append, { actor, id: "cn-1", kind: "evidence", body });
    const events = await t.run((ctx) =>
      ctx.db
        .query("events")
        .filter((q) => q.eq(q.field("kind"), "journal.append"))
        .collect(),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.revision).toBeUndefined();
    expect(events[0]!.changes).toEqual({ kind: "evidence", body: "e".repeat(80) });
  });

  it("takes an entry after a close, because evidence arrives late", async () => {
    const t = await seeded();
    await t.mutation(api.issues.close, {
      actor,
      id: "cn-1",
      revision: 0,
      verification: { unverified: "checked by hand on the device" },
    });
    await expect(
      t.mutation(api.journal.append, {
        actor,
        id: "cn-1",
        kind: "evidence",
        body: "the retry path works on the Pixel",
      }),
    ).resolves.toMatchObject({ kind: "evidence" });
  });

  it("refuses a blank body and an id nothing answers to", async () => {
    const t = await seeded();
    await expect(
      t.mutation(api.journal.append, { actor, id: "cn-1", kind: "finding", body: "  " }),
    ).rejects.toMatchObject({ data: { kind: "invalid" } });
    await expect(
      t.mutation(api.journal.append, { actor, id: "cn-9", kind: "finding", body: "x" }),
    ).rejects.toMatchObject({ data: { kind: "not-found" } });
  });

  it("shows the last five, newest first", async () => {
    const t = await seeded();
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await t.mutation(api.journal.append, {
        actor,
        id: "cn-1",
        kind: "finding",
        body: `entry ${n}`,
      });
    }
    const shown = await t.query(api.show.get, { id: "cn-1" });
    expect(shown.kind === "issue" ? shown.journal.map((e) => e.body) : []).toEqual([
      "entry 6",
      "entry 5",
      "entry 4",
      "entry 3",
      "entry 2",
    ]);
  });
});
