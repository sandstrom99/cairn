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

import { parseArgs } from "../lib/args.mts";
import { can } from "../lib/can.mts";
import { usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { readyLine } from "../lib/format.mts";

export const name = "ready";
export const summary = "what can be picked up right now, marked with what this session cannot do";

export type Parsed =
  | { action: "help" }
  | { action: "ready"; json: boolean; can: string[] | undefined };

export function parse(argv: string[]): Parsed {
  const { opts } = parseArgs(argv, { bool: ["help", "json"], list: ["can"] });
  if (opts.help) return { action: "help" };
  // A bare `--can` is an empty list, which is a session declaring nothing; an absent one
  // is undefined, which falls through to the environment and the config.
  return {
    action: "ready",
    json: Boolean(opts.json),
    can: Array.isArray(opts.can) ? opts.can : undefined,
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const issues = await client.query(api.ready.list, { can: can(parsed.can) });
  if (parsed.json) console.log(JSON.stringify(issues, null, 2));
  else if (issues.length > 0) console.log(issues.map(readyLine).join("\n"));
  return 0;
}
