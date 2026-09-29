// The one-off that strips `requires` (patch.ts). Its whole input is rows no verb writes any
// more, issues from before cn-119, so this is the one file that writes a field into a table
// itself: `ctx.db.patch` stands in for the code that is gone, and everything else is made
// the usual way.
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { issueById } from "../lib/lookup";
import { type Harness, rawIssue, rows, seed } from "./test.fixtures";

/** Writes `requires` onto cn-N, as the old `issues.create` did onto every issue. */
const written = (t: Harness, id: string, requires: string[]) =>
  t.run(async (ctx) => ctx.db.patch((await issueById(ctx, id))._id, { requires }));

describe("patch.dropRequires", () => {
  it("unsets requires on every issue that carries it, and nothing else", async () => {
    const t = await seed({ issues: ["one", "two", "three"] });
    await written(t, "cn-1", []);
    await written(t, "cn-2", ["ios"]);
    const before = await rawIssue(t, "cn-2");

    expect(await t.mutation(internal.patch.dropRequires, {})).toEqual({ issues: 3, stripped: 2 });

    for (const doc of await rows(t, "issues")) expect(doc).not.toHaveProperty("requires");
    const { requires: _, ...rest } = before!;
    expect(await rawIssue(t, "cn-2")).toEqual(rest);
  });

  it("writes no event and bumps no revision, and a second run finds nothing", async () => {
    const t = await seed({ issues: ["one"] });
    await written(t, "cn-1", ["decision"]);
    const events = (await rows(t, "events")).length;

    await t.mutation(internal.patch.dropRequires, {});
    expect((await rows(t, "events")).length).toBe(events);
    expect((await rawIssue(t, "cn-1"))!.revision).toBe(0);
    expect(await t.mutation(internal.patch.dropRequires, {})).toEqual({ issues: 1, stripped: 0 });
  });

  it("is internal: no client reaches it through the public api", () => {
    expect("patch" in api).toBe(false);
  });
});
