// args.mts: the one argument parser. Adapted from Invyte's tools/lib/args.mts.
//
//   import { parseArgs } from "../lib/args.mts";
//   const { pos, opts } = parseArgs(argv, { bool: ["json"], value: ["epic"], list: ["requires"] });
//
// A bool flag is `--x`; `--x=no|false|0|off` turns it off. A value flag is `--x y` or
// `--x=y`, and the last one wins. A list flag swallows every following positional
// (`--requires ios device`) or takes `--x=y`, and accumulates across repeats. `--` ends
// the flags.
// An unknown flag, or a value flag with no value, throws UsageError, which `main()`
// turns into exit 2.

import { UsageError } from "./cli.mts";

const OFF = ["no", "false", "0", "off"];

/** Which names take which shape. A name absent from all three is an unknown option. */
export type ArgSpec = {
  bool?: string[];
  value?: string[];
  list?: string[];
};

/** A bool is true/false, a value a string, a list an array. */
export type ArgValue = boolean | string | string[];

export type ParsedArgs = { pos: string[]; opts: Record<string, ArgValue> };

export function parseArgs(
  argv: string[],
  { bool = [], value = [], list = [] }: ArgSpec = {},
): ParsedArgs {
  const pos: string[] = [];
  const opts: Record<string, ArgValue> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const name = a.slice(2, eq < 0 ? undefined : eq);
    const given = eq >= 0 ? a.slice(eq + 1) : undefined;
    if (list.includes(name)) {
      const acc = (opts[name] ??= []) as string[];
      if (given !== undefined) acc.push(given);
      else while (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) acc.push(argv[++i]!);
      continue;
    }
    if (bool.includes(name)) {
      opts[name] = given === undefined ? true : !OFF.includes(given.toLowerCase());
      continue;
    }
    if (!value.includes(name)) throw new UsageError(`unknown option ${a}`);
    const v = given ?? argv[++i];
    if (v === undefined || (given === undefined && v.startsWith("--")))
      throw new UsageError(`--${name} takes a value`);
    opts[name] = v;
  }
  return { pos, opts };
}
