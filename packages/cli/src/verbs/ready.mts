// cn ready — what can be picked up right now.
//
//   cn ready [--can ios android web device decision] [--json]
//
// An issue is ready when it is open, nothing open blocks it, no unresolved human blocker
// is attached, and its defer date has passed — ordered by priority, then age. It is
// computed live on every call: the moment a blocker closes, what it held is ready, with
// no recompute step in between.
//
// An issue in progress is somebody's claim, not ready work, so it is not here; `cn list`
// is the flat view of everything.
//
// --can says what this session has; without it, CAIRN_CAN, then `can` in
// ~/.config/cairn/config.json. It only ever *marks*: a row this session cannot finish
// comes back with `· needs ios` and is never hidden, because a wrong capability list
// quietly hiding work is the one failure this is written to avoid.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyFlags } from "../lib/flags.mts";
import { answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { readyLine } from "../lib/lines.mts";

export const name = "ready";
export const summary = "what can be picked up right now, marked with what this session cannot do";
export const spec = { bool: ["json"], list: ["can"] } as const satisfies ArgSpec;

type Parsed = { action: "ready"; json: boolean; can: string[] | undefined };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  onlyFlags(pos, "cn ready [--can ios android web device decision] [--json]");
  // A bare `--can` is an empty list, which is a session declaring nothing; an absent one
  // is undefined, which falls through to the environment and the config.
  return { action: "ready", json: opts.json, can: opts.can };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client, can } = connect({ can: parsed.can });
  const issues = await client.query(api.ready.list, { can });
  answer(parsed.json, issues, (all) => all.map((i) => readyLine(i)));
  return 0;
}
