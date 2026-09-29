// The secret that fences a deployment (lib/guard.ts). Three cases, through a public
// function rather than `check` alone, because what matters is that the wrapper rejects
// before the handler and that the argument never reaches it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { actor, eventsOf, fresh } from "./test.fixtures";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("guard", () => {
  it("rejects a call with no secret when the deployment has one", async () => {
    vi.stubEnv("CAIRN_SECRET", "s3cret");
    const t = fresh();
    await expect(t.query(api.projects.list, {})).rejects.toThrow(
      "this deployment needs a secret it did not get",
    );
    // The fix it names is the one a machine can run itself, and the one cn doctor names.
    await expect(t.query(api.projects.list, {})).rejects.toThrow("cn init --refresh");
    await expect(t.query(api.projects.list, { secret: "wrong" })).rejects.toMatchObject({
      data: { kind: "unauthorized" },
    });
  });

  it("runs the handler with the right secret, and never passes it on", async () => {
    vi.stubEnv("CAIRN_SECRET", "s3cret");
    const t = fresh();
    await t.mutation(api.projects.create, {
      actor,
      slug: "web",
      name: "northwind.example",
      secret: "s3cret",
    });
    const projects = await t.query(api.projects.list, { secret: "s3cret" });
    expect(projects.map(({ slug, name }) => ({ slug, name }))).toEqual([
      { slug: "web", name: "northwind.example" },
    ]);
    const events = await eventsOf(t);
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toContain("s3cret");
  });

  it("checks nothing when the deployment has no secret", async () => {
    const t = fresh();
    await t.mutation(api.projects.create, { actor, slug: "app", name: "the Flutter app" });
    const projects = await t.query(api.projects.list, {});
    expect(projects.map(({ slug, name }) => ({ slug, name }))).toEqual([
      { slug: "app", name: "the Flutter app" },
    ]);
  });
});
