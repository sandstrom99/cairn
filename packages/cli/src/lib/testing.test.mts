// testing.test.mts: the fixtures are declared once. Every test in this package and in
// apps/web builds from lib/testing.mts, so no test file declares a clock, a span, a
// temp config home or an issue of its own; the second copy is how the three drifted
// apart, with a cast for every field the deployment had moved (cn-50).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules") return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const tests = [
  ...walk(join(ROOT, "packages", "cli", "src")),
  ...walk(join(ROOT, "apps", "web", "src")),
].filter((f) => /\.test\.(mts|ts|tsx)$/.test(f));

/** What lib/testing.mts declares, which a test file may only import. */
const DECLARED =
  /^(?:export )?(?:const|let|function) (now|ago|MINUTE|HOUR|DAY|tempHome|tempConfig|issue|epic|blocker)\b/m;

describe("no test file declares its own fixtures", () => {
  it("finds the test files", () => {
    expect(tests.length).toBeGreaterThan(10);
  });

  for (const file of tests) {
    it(relative(ROOT, file), () => {
      const declared = readFileSync(file, "utf8").match(DECLARED);
      expect(declared?.[0]).toBeUndefined();
    });
  }
});
