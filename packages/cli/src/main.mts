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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UsageError, isMain, main } from "./lib/cli.mts";
import { VERBS } from "./verbs/index.mts";

const version = (): string =>
  JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
  ).version ?? "0.0.0";

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
  return found.run(rest);
};

if (isMain(import.meta.url)) void main(cn);
