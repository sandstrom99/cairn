// The secret that fences a deployment (lib/guard.ts). Three cases, through a public
// function rather than `check` alone, because what matters is that the wrapper rejects
// before the handler and that the argument never reaches it.
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const actor = { name: "wsl/claude", kind: "agent" } as const;
const modules = import.meta.glob("../**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("guard", () => {
  it("rejects a call with no secret when the deployment has one", async () => {
    vi.stubEnv("CAIRN_SECRET", "s3cret");
    const t = convexTest(schema, modules);
    await expect(t.query(api.projects.list, {})).rejects.toThrow(
      "this deployment needs a secret it did not get",
    );
    await expect(t.query(api.projects.list, { secret: "wrong" })).rejects.toMatchObject({
      data: { kind: "unauthorized" },
    });
  });

  it("runs the handler with the right secret, and never passes it on", async () => {
    vi.stubEnv("CAIRN_SECRET", "s3cret");
    const t = convexTest(schema, modules);
    await t.mutation(api.projects.create, {
      actor,
      slug: "web",
      name: "invyte.dk",
      secret: "s3cret",
    });
    const projects = await t.query(api.projects.list, { secret: "s3cret" });
    expect(projects).toEqual([{ slug: "web", name: "invyte.dk" }]);
    const events = await t.run(async (ctx) => await ctx.db.query("events").collect());
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toContain("s3cret");
  });

  it("checks nothing when the deployment has no secret", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.projects.create, { actor, slug: "app", name: "the Flutter app" });
    expect(await t.query(api.projects.list, {})).toEqual([
      { slug: "app", name: "the Flutter app" },
    ]);
  });
});
