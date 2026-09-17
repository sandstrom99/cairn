// actor.mts: who cn says is acting. Until identity auth exists the actor is an argument
// the CLI fills in (docs/design.md §12, §13), so it is derived once here and nowhere else.
//
//   CAIRN_ACTOR        wins outright
//   otherwise          <host>/claude with CLAUDECODE set, <host>/<user> without it
//   host               CAIRN_HOST, then `host` in the config file, then this machine's
//
// Claude Code sets CLAUDECODE in every shell it runs, which is the whole test for `kind`:
// a session on this machine is wsl/claude as an agent, Balder at a terminal is
// wsl/balder as a human. Nothing else distinguishes them until a token does.

import { hostname, userInfo } from "node:os";
import { readConfig } from "./config.mts";

export type Actor = { name: string; kind: "human" | "agent" };

/** The machine facts the actor is built from, injectable so the derivation is testable. */
export type Sys = { hostname: () => string; username: () => string };

const SYS: Sys = { hostname, username: () => userInfo().username };

/** The actor every mutation carries. */
export function actor(env: NodeJS.ProcessEnv = process.env, sys: Sys = SYS): Actor {
  const kind: Actor["kind"] = env.CLAUDECODE ? "agent" : "human";
  const host = env.CAIRN_HOST ?? readConfig(env)?.host ?? sys.hostname();
  const name = env.CAIRN_ACTOR ?? `${host}/${kind === "agent" ? "claude" : sys.username()}`;
  return { name, kind };
}
