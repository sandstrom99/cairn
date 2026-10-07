// actor.mts: who cn says is acting. The actor is an argument the CLI fills in, taken on
// trust (docs/design.md §12, §13), so it is derived once here and nowhere else.
//
//   CAIRN_ACTOR        wins outright
//   otherwise          <host>/claude with CLAUDECODE set, <host>/<user> without it
//   host               CAIRN_HOST, then `host` in the config file, then this machine's
//                      hostname up to its first dot, lowercased
//   session            CAIRN_SESSION when set, which the SessionStart hook exports
//
// The config file comes in as read: lib/session.mts reads it once per call and hands it
// here, so deriving the actor never opens the file itself.
//
// Claude Code sets CLAUDECODE in every shell it runs, which is the whole test for `kind`:
// a session on Harbor's Mac is harbor-mac/claude as an agent, Harbor at a terminal
// there is harbor-mac/harbor as a human. Nothing else distinguishes them, and no token is
// planned: the host carries the person's name, which is how a colleague's agents differ.
//
// Every session on a machine is the same wsl/claude, so the name cannot tell two parallel
// sessions apart. The session id sits beside it: the hook writes `export CAIRN_SESSION=…`
// to the file Claude Code sources before every Bash command, a claim is idempotent on
// name and session together, and the brief marks what this session holds. A human
// terminal has none, and the name stays as it was so the log keeps one stable actor.
//
// The OS hostname is cut to its first label and lowercased because a Mac's is
// `Harbors-Mac-mini.local`, and that on every claim reads like noise beside the
// `harbor-mac/claude` the docs show. A name someone chose, through CAIRN_HOST or
// `cn init --host`, is taken as given.

import { hostname, userInfo } from "node:os";
import type { CairnConfig } from "./config.mts";

export type Actor = { name: string; kind: "human" | "agent"; session?: string };

/** The machine facts the actor is built from, injectable so the derivation is testable. */
type Sys = { hostname: () => string; username: () => string };

const SYS: Sys = { hostname, username: () => userInfo().username };

/** The OS hostname as an actor's host: up to the first dot, lowercased. */
export function shortHost(name: string): string {
  return name.split(".")[0]?.toLowerCase() || name;
}

/** The actor every mutation carries. */
export function actor(env: NodeJS.ProcessEnv, config: CairnConfig | null, sys: Sys = SYS): Actor {
  const kind: Actor["kind"] = env.CLAUDECODE ? "agent" : "human";
  const host = env.CAIRN_HOST ?? config?.host ?? shortHost(sys.hostname());
  const name = env.CAIRN_ACTOR ?? `${host}/${kind === "agent" ? "claude" : sys.username()}`;
  const session = env.CAIRN_SESSION;
  return session ? { name, kind, session } : { name, kind };
}
