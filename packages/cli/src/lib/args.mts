// args.mts: the one argument parser.
//
//   import { parseArgs } from "../lib/args.mts";
//   const { pos, opts } = parseArgs(argv, { bool: ["json"], value: ["epic"], list: ["requires"] });
//   // opts.json: boolean · opts.epic: string | undefined · opts.requires: string[] | undefined
//
// The spec types the result: a bool is `boolean`, false when not given; a value is
// `string | undefined`; a list is `string[] | undefined`. What the string has to be, an
// integer, a date, one of a set of words, is flags.mts's question, asked once there.
//
// A bool flag is `--x`; `--x=no|false|0|off` turns it off. A value flag is `--x y` or
// `--x=y`, and the last one wins. A list flag swallows every following positional
// (`--requires ios device`) or takes `--x=y`, and accumulates across repeats. `--` ends
// the flags. An unknown flag, or a value flag with no value, throws UsageError, which
// `main()` turns into exit 2.

import { UsageError } from "./cli.mts";

const OFF = ["no", "false", "0", "off"];

/** Which names take which shape. A name absent from all three is an unknown option. */
export type ArgSpec = {
  readonly bool?: readonly string[];
  readonly value?: readonly string[];
  readonly list?: readonly string[];
};

type Names<A> = A extends readonly (infer N extends string)[] ? N : never;

/** The flags a spec names, each typed by its shape. */
type Opts<S extends ArgSpec> = { [K in Names<S["bool"]>]: boolean } & {
  [K in Names<S["value"]>]?: string;
} & { [K in Names<S["list"]>]?: string[] };

type ParsedArgs<S extends ArgSpec> = { pos: string[]; opts: Opts<S> };

export function parseArgs<const S extends ArgSpec>(argv: string[], spec: S): ParsedArgs<S> {
  const { bool = [], value = [], list = [] } = spec;
  const pos: string[] = [];
  const opts: Record<string, boolean | string | string[]> = {};
  for (const name of bool) opts[name] = false;
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
  return { pos, opts: opts as Opts<S> };
}
