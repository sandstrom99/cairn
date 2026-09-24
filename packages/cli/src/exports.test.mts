// exports.test.mts: what packages/cli/src exports is what something imports. Every
// exported name of every module here has a named import in another file of this
// package, tests included, or in apps/web, which reaches this package through the
// exports map in package.json and nothing else. A verb module's `name`, `summary`,
// `spec` and `run` are read whole by the registry (verbs/index.mts) through `import *`,
// which is the one namespace import and the four names it takes.
//
// The type check cannot say this: noUnusedLocals sees what a module keeps to itself, and
// an `export` is the promise of a caller. An export nothing imports is a type or a
// function kept for a caller that never came, and the 2026-09-21 audit found about
// twenty of them.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const CLI = join(ROOT, "packages", "cli");
const SRC = join(CLI, "src");
const WEB = join(ROOT, "apps", "web", "src");

/** What the registry reads from each verb module through its namespace import. */
const REGISTRY = ["name", "summary", "spec", "run"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules") return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const modules = walk(SRC).filter((f) => f.endsWith(".mts"));
const consumers = [...modules, ...walk(WEB).filter((f) => /\.tsx?$/.test(f))];

const pkg = JSON.parse(readFileSync(join(CLI, "package.json"), "utf8")) as {
  exports: Record<string, string>;
};

/** The module a specifier names, or null for a package that is not this one. */
function target(from: string, spec: string): string | null {
  if (spec.startsWith(".")) return resolve(dirname(from), spec);
  if (!spec.startsWith("@cairn/cli/")) return null;
  const served = pkg.exports[`./${spec.slice("@cairn/cli/".length)}`];
  if (!served)
    throw new Error(
      `${relative(ROOT, from)} imports ${spec}, which the exports map does not serve`,
    );
  return resolve(CLI, served);
}

/** `a, type b, c as d` → a, b, c. */
const named = (list: string): string[] =>
  list
    .split(",")
    .map((n) =>
      n
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]!
        .trim(),
    )
    .filter((n) => n !== "");

/** The names a file imports, by the module it takes them from. */
function imports(file: string): Map<string, Set<string>> {
  const src = readFileSync(file, "utf8");
  const found = new Map<string, Set<string>>();
  const add = (spec: string, name: string): void => {
    const module = target(file, spec);
    if (module === null) return;
    if (!found.has(module)) found.set(module, new Set());
    found.get(module)!.add(name);
  };
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g))
    for (const n of named(m[1]!)) add(m[2]!, n);
  for (const m of src.matchAll(/\{([^}]*)\}\s*=\s*await import\("([^"]+)"\)/g))
    for (const n of m[1]!.split(",")) add(m[2]!, n.trim().split(/\s*:\s*/)[0]!);
  for (const m of src.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+"([^"]+)"/g)) {
    for (const n of REGISTRY) add(m[2]!, n);
    for (const use of src.matchAll(new RegExp(`\\b${m[1]}\\.(\\w+)`, "g"))) add(m[2]!, use[1]!);
  }
  return found;
}

/** The names a module exports: declarations, and an `export { … }` list. */
function exportsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const names: string[] = [];
  for (const m of src.matchAll(
    /^export (?:type|interface|const|let|class|function|async function) (\w+)/gm,
  ))
    names.push(m[1]!);
  for (const m of src.matchAll(/^export (?:type )?\{([^}]*)\}/gm))
    for (const n of m[1]!.split(",")) {
      const name = n
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop()!
        .trim();
      if (name !== "") names.push(name);
    }
  return names;
}

const importedBy = new Map<string, Set<string>>();
for (const file of consumers)
  for (const [module, names] of imports(file)) {
    if (!importedBy.has(module)) importedBy.set(module, new Set());
    for (const n of names) importedBy.get(module)!.add(n);
  }

describe("every export has an importer", () => {
  for (const module of modules) {
    const names = exportsOf(module);
    if (names.length === 0) continue;
    it(relative(SRC, module), () => {
      const imported = importedBy.get(module) ?? new Set<string>();
      expect(names.filter((n) => !imported.has(n))).toEqual([]);
    });
  }
});
