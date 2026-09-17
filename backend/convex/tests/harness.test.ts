// The test harness boots against the real schema. Nothing domain-specific is asserted
// yet; this proves convex-test, the edge runtime and the schema import agree.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";

describe("harness", () => {
  it("boots convex-test against the schema", async () => {
    const t = convexTest(schema, import.meta.glob("../**/*.ts"));
    expect(t).toBeDefined();
  });
});
