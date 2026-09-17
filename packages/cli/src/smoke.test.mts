// smoke.test.mts: the real cn, under the real Node. Every other test imports modules
// through vitest, which resolves an extensionless import the way a bundler does. Node
// does not: `cn` runs its .mts source directly, and a relative import without its
// extension dies at load time. The type check no longer catches that either, because
// it resolves like a bundler so it can follow the backend's extensionless sources
// (tsconfig.json). So this test spawns Node on main.mts for `--help` and for every verb's
// `--help`, which loads every module on the way and fails on the first bad import.

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VERBS } from "./verbs/index.mts";

const MAIN = join(dirname(fileURLToPath(import.meta.url)), "main.mts");

/** stdout of `node main.mts <args>`, or a throw carrying stderr, as Node would. */
const cn = (...args: string[]): string =>
  execFileSync(process.execPath, [MAIN, ...args], { encoding: "utf8", stdio: "pipe" });

describe("cn under node", () => {
  it("loads and lists every verb", () => {
    const out = cn("--help");
    for (const verb of VERBS) expect(out).toContain(verb.name);
  });

  for (const verb of VERBS) {
    it(`loads the ${verb.name} verb and prints its header`, () => {
      expect(cn(verb.name, "--help")).toMatch(new RegExp(`^cn ${verb.name} —`));
    });
  }
});
