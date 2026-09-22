// skill.test.mts: the plugin cannot teach a verb that does not exist. SKILL.md and the
// slash commands are prose, so nothing else fails when a verb is renamed, dropped or
// written down before it is built — and an agent told to run `cn review` runs it,
// gets `unknown verb`, and has no way to tell a typo from a missing feature. This test
// reads the shipped markdown and checks every `cn <word>` in it against the registry.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VERBS } from "./verbs/index.mts";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "plugins", "cairn");
const names = new Set(VERBS.map((v) => v.name));

/** Every verb name the text invokes: `cn brief`, `cn dep add` — the first word only. */
const invoked = (text: string): string[] =>
  [...text.matchAll(/\bcn ([a-z][a-z-]*)\b/g)].map((m) => m[1] ?? "");

const unknown = (text: string): string[] =>
  [...new Set(invoked(text))].filter((v) => !names.has(v));

describe("the plugin names verbs that exist", () => {
  it("SKILL.md", () => {
    const text = readFileSync(join(PLUGIN, "skills", "cairn", "SKILL.md"), "utf8");
    expect(invoked(text).length).toBeGreaterThan(0);
    expect(unknown(text)).toEqual([]);
  });

  it("every slash command", () => {
    const dir = join(PLUGIN, "commands");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(join(dir, file), "utf8");
      expect({ file, unknown: unknown(text) }).toEqual({ file, unknown: [] });
    }
  });
});
