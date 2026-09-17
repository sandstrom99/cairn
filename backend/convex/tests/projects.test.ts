// A project is the id prefix and a name. The rules worth a test are the ones that would
// corrupt an id: a slug that cannot be a prefix, one reserved for epics or blockers, and
// a second project claiming a prefix that is already minting.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const modules = import.meta.glob("../**/*.ts");

describe("projects", () => {
  it("creates a project and lists it by slug", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.projects.create, { actor, slug: "web", name: "invyte.dk" });
    await t.mutation(api.projects.create, { actor, slug: "app", name: "the Flutter app" });
    expect(await t.query(api.projects.list, {})).toEqual([
      { slug: "app", name: "the Flutter app" },
      { slug: "web", name: "invyte.dk" },
    ]);
  });

  it("refuses a slug that cannot be an id prefix", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.projects.create, { actor, slug: "Web App", name: "x" }),
    ).rejects.toMatchObject({ data: { kind: "invalid" } });
  });

  it("refuses ep and bl, which epics and blockers mint from", async () => {
    const t = convexTest(schema, modules);
    for (const slug of ["ep", "bl"]) {
      await expect(
        t.mutation(api.projects.create, { actor, slug, name: "x" }),
      ).rejects.toMatchObject({ data: { kind: "invalid" } });
    }
  });

  it("refuses a slug that already exists", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
    await expect(
      t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn again" }),
    ).rejects.toMatchObject({ data: { kind: "conflict" } });
  });

  it("records one project.create event", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
    const events = await t.run((ctx) => ctx.db.query("events").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "project.create",
      actor,
      changes: { slug: "cn", name: "cairn" },
    });
  });
});
