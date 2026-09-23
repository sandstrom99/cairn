#!/usr/bin/env node
// cn — the cairn CLI.
//
//   cn <verb> [args]      run a verb; `cn <verb> --help` is its contract
//   cn --help             this list
//   cn --version
//
// One verb is one Convex function call plus formatting. Every output line for an issue
// or epic starts with its reference form, `app-14 "fix connection retry"`, and every
// read verb takes --json.
//
// `--help` and `-h` are answered here, once, before a verb runs: anywhere on the line up
// to a `--`, they print the verb's header and nothing else happens, so `cn show -h` is
// the contract of show and never a query for the id `-h`. A verb's name is its file,
// which is how the header is found without the verb's help.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UsageError, isMain, main } from "./lib/cli.mts";
import { VERBS, header } from "./verbs/index.mts";

/** The version in this package's package.json, which `cn --version` prints as it is. */
const version = (): string => {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const found: unknown = JSON.parse(readFileSync(file, "utf8")).version;
  if (typeof found !== "string") throw new Error(`${file} has no version`);
  return found;
};

function help(): string {
  const width = Math.max(...VERBS.map((v) => v.name.length));
  const rows = VERBS.map((v) => `  ${v.name.padEnd(width)}   ${v.summary}`);
  return [
    "cn — the cairn CLI",
    "",
    "usage: cn <verb> [args]",
    "",
    ...rows,
    "",
    "cn <verb> --help for a verb's contract",
  ].join("\n");
}

/** `--help` or `-h` anywhere on the line before a `--`, which ends the flags. */
export const wantsHelp = (rest: string[]): boolean => {
  const end = rest.indexOf("--");
  return (end < 0 ? rest : rest.slice(0, end)).some((a) => a === "--help" || a === "-h");
};

export const cn = async (argv: string[]): Promise<unknown> => {
  const [verb, ...rest] = argv;
  if (!verb || verb === "--help" || verb === "help" || verb === "-h") {
    console.log(help());
    return 0;
  }
  if (verb === "--version" || verb === "-V") {
    console.log(version());
    return 0;
  }
  const found = VERBS.find((v) => v.name === verb);
  if (!found) throw new UsageError(`unknown verb "${verb}"; cn --help lists them`);
  if (wantsHelp(rest)) {
    console.log(header(found.name));
    return 0;
  }
  return found.run(rest);
};

if (isMain(import.meta.url)) void main(cn);
