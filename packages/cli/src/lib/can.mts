// can.mts: what this session can do, in one place.
//
//   import { can } from "../lib/can.mts";
//   const capabilities = can(flag);   // ["ios", "web"]
//
//   --can ios web            wins, and `--can` with nothing after it is "nothing"
//   CAIRN_CAN=ios,web        next, split on commas and whitespace, for hooks and crons
//   "can" in config.json     next: what this machine has, written once
//   nothing                  []
//
// The vocabulary starts at ios, android, web, device and decision, and grows only when
// something is actually fenced (docs/design.md §12). It is advisory everywhere it is
// read: `cn ready` marks what a session cannot finish and hides none of it, because a
// wrong `can[]` silently hiding work is the beads failure this design exists to avoid.

import { readConfig } from "./config.mts";

/** The capabilities for this call: the flag, then the environment, then the config. */
export function can(flag: string[] | undefined, env: NodeJS.ProcessEnv = process.env): string[] {
  if (flag !== undefined) return flag;
  // An empty CAIRN_CAN is a declaration of nothing, the same as a bare --can.
  if (env.CAIRN_CAN !== undefined) return env.CAIRN_CAN.split(/[\s,]+/).filter((c) => c !== "");
  return readConfig(env)?.can ?? [];
}
