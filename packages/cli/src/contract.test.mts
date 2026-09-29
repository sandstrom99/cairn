// contract.test.mts: the verb contract, held in one place. A verb's flags are declared
// once, in the `spec` it hands parseArgs, and three things have to agree with it:
//
//   - its header, which is its --help: the flags in the synopsis are the spec's, no more
//     and no fewer, so a flag added without its line in the header fails here;
//   - SKILL.md, the slash commands, docs/design.md §10 and packages/cli/README.md, which
//     teach the verbs: every `--flag` they mention exists, on the verb a code span names
//     where it starts `cn <verb>` and on some verb otherwise, and every `cn <word>` a
//     code span or a fenced line opens with is a verb — in the plugin's markdown, every
//     `cn <word>` anywhere, since that is what an agent is told to run;
//   - design §10's table, which is, in its own words, the contract the skill teaches and
//     the headers restate: it names every flag of every verb, except --json, which it
//     states once below the table for every read verb;
//   - AGENTS.md's verify table, whose per-verb rows are the rows scripts/verify-e2e.mjs
//     runs: the same names, in the same order, and the count the table quotes.
//
// The docs are prose, so nothing else fails when a verb is renamed, a flag dropped, or
// one written down before it is built — and an agent told to run `cn review --all` runs
// it, gets `unknown option`, and has no way to tell a typo from a missing feature.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ArgSpec } from "./lib/args.mts";
import { VERBS, header } from "./verbs/index.mts";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const read = (...path: string[]): string => readFileSync(join(ROOT, ...path), "utf8");

/** The shell's own flags, answered in main.mts before any verb runs. */
const SHELL = ["help", "version"];

const names = new Set(VERBS.map((v) => v.name));
const flagsOf = (spec: ArgSpec): string[] => [
  ...(spec.bool ?? []),
  ...(spec.value ?? []),
  ...(spec.list ?? []),
];
/** What each verb takes, the shell's flags included, since `cn <verb> --help` is a line. */
const specs = new Map(VERBS.map((v) => [v.name, new Set([...flagsOf(v.spec), ...SHELL])]));
/** What some verb takes. */
const known = new Set([...SHELL, ...VERBS.flatMap((v) => flagsOf(v.spec))]);

/** Every `--flag` in a text, by name; `--x=y` is `x`. */
const flags = (text: string): string[] => [...text.matchAll(/--([a-z][a-z-]*)/g)].map((m) => m[1]!);

/** Every verb name the text invokes: `cn brief`, `cn dep add` — the first word only. */
const invoked = (text: string): string[] =>
  [...text.matchAll(/\bcn ([a-z][a-z-]*)\b/g)].map((m) => m[1]!);

/**
 * One thing a document says: the word it invokes after `cn`, which had better be a verb,
 * and its flags, on that verb or on some verb when none is named.
 */
type Mention = { invokes?: string; verb?: string; flags: string[]; where: string };

/**
 * What a document says, one mention per code span or fenced line. Code that starts
 * `cn <word>` invokes that word and speaks about that verb; `cn <verb>` with no verb's
 * name, or a flag on its own (`--json`, `[--link …]`), speaks about some verb; any other
 * code is another program's line (`npx convex … --deployment`) and says nothing. Prose
 * outside code speaks about some verb. A fenced line continued with `\` is one line.
 */
function mentions(text: string, where: string): Mention[] {
  const out: Mention[] = [];
  const speak = (code: string): void => {
    const found = flags(code);
    const at = `${where}: ${code}`;
    const invokes = /^cn ([a-z][a-z-]*)\b/.exec(code)?.[1];
    if (invokes !== undefined)
      out.push({
        invokes,
        ...(names.has(invokes) ? { verb: invokes } : {}),
        flags: found,
        where: at,
      });
    else if (found.length > 0 && (/^cn\b/.test(code) || /^\[?--/.test(code)))
      out.push({ flags: found, where: at });
  };
  const prose = text
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, block: string) => {
      for (const line of block.replace(/\\\n\s*/g, " ").split("\n")) speak(line.trim());
      return " ";
    })
    .replace(/`([^`\n]+)`/g, (_, code: string) => {
      speak(code.trim());
      return " ";
    });
  out.push({ flags: flags(prose), where: `${where}: prose` });
  return out;
}

/** The synopsis of a header: its indented `cn …` lines, up to the blank line after them. */
function synopsisOf(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^\s+cn /.test(l));
  expect(start, "a header opens with an indented `cn …` synopsis").toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start);
  const end = rest.findIndex((l) => l.trim() === "");
  return rest.slice(0, end < 0 ? undefined : end).join("\n");
}

/** Design §10, "Surfaces": from its heading to the next section's. */
function section10(): string {
  const text = read("docs", "design.md");
  const start = text.indexOf("\n## 10. ");
  const end = text.indexOf("\n## 11. ");
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

const sorted = (list: Iterable<string>): string[] => [...new Set(list)].sort();

describe("a verb's header restates its spec", () => {
  for (const verb of VERBS) {
    it(`cn ${verb.name}`, () => {
      expect(sorted(flags(synopsisOf(header(verb.name))))).toEqual(sorted(flagsOf(verb.spec)));
    });
  }
});

const commands = readdirSync(join(ROOT, "plugins", "cairn", "commands")).filter((f) =>
  f.endsWith(".md"),
);

/** Each document, and whether its prose is read as instructions too: the plugin's is. */
const DOCS: [string, () => string, boolean][] = [
  ["SKILL.md", () => read("plugins", "cairn", "skills", "cairn", "SKILL.md"), true],
  ...commands.map((f): [string, () => string, boolean] => [
    `commands/${f}`,
    () => read("plugins", "cairn", "commands", f),
    true,
  ]),
  ["design.md §10", section10, false],
  ["packages/cli/README.md", () => read("packages", "cli", "README.md"), false],
];

describe("the docs name verbs and flags that exist", () => {
  it("has the plugin's commands", () => {
    expect(commands.length).toBeGreaterThan(0);
  });

  for (const [name, load, prose] of DOCS) {
    it(name, () => {
      const text = load();
      const said = mentions(text, name);
      const invokes = [...said.flatMap((m) => m.invokes ?? []), ...(prose ? invoked(text) : [])];
      expect(invokes.length).toBeGreaterThan(0);
      const unknownVerbs = sorted(invokes).filter((v) => !names.has(v));
      expect({ unknownVerbs }).toEqual({ unknownVerbs: [] });
      for (const m of said) {
        const allowed = m.verb === undefined ? known : specs.get(m.verb)!;
        const unknown = m.flags.filter((f) => !allowed.has(f));
        expect({ where: m.where, unknown }).toEqual({ where: m.where, unknown: [] });
      }
    });
  }
});

/** The per-verb rows of AGENTS.md's verify table: its "Changed" cells from the first `verbs/` row on. */
function verifyRows(): string[] {
  const text = read("AGENTS.md");
  const start = text.indexOf("\n## Verify a change");
  const end = text.indexOf("\n## ", start + 1);
  expect(start).toBeGreaterThan(0);
  const cells = text
    .slice(start, end)
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => line.slice(2, line.indexOf(" | ")).replace(/`/g, ""));
  const first = cells.findIndex((cell) => cell.startsWith("verbs/"));
  expect(first).toBeGreaterThan(0);
  return cells.slice(first);
}

/** The rows scripts/verify-e2e.mjs declares, in the order it runs them. */
const e2eRows = (): string[] =>
  [...read("scripts", "verify-e2e.mjs").matchAll(/^row\("([^"]+)", /gm)].map((m) => m[1]!);

describe("AGENTS.md's per-verb rows are the e2e script's rows", () => {
  it("names the same rows, in the same order", () => {
    expect(e2eRows()).toEqual(verifyRows());
  });

  it("quotes the count the script prints when every row passes", () => {
    expect(read("AGENTS.md")).toContain(`e2e: ${e2eRows().length} rows passed`);
  });
});

describe("design §10 names every flag of every verb, --json aside", () => {
  const said = mentions(section10(), "design.md §10");
  for (const verb of VERBS) {
    it(`cn ${verb.name}`, () => {
      const named = said.filter((m) => m.verb === verb.name).flatMap((m) => m.flags);
      const exceptJson = (f: string) => f !== "json";
      expect(sorted(named).filter(exceptJson)).toEqual(
        sorted(flagsOf(verb.spec)).filter(exceptJson),
      );
    });
  }
});
