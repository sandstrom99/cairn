// session.mts: what one cn call is, read once.
//
//   import { session } from "../lib/session.mts";
//   const { deployment, actor, can } = session({ can: parsed.can });
//
// A verb used to read ~/.config/cairn/config.json up to four times on its way to one
// call: once to resolve the deployment, once for the actor's host, once for what the
// machine can do, and once more inside connect(). The file is read here, once, and the
// three facts are derived from that one read: which deployment (lib/config.mts), who is
// acting (lib/actor.mts) and what this session can do (lib/can.mts). Each keeps its own
// rule and its own test; this is where they meet. `cn init` reads the file itself, since
// it is about to write it, and it is the one verb that does.
//
// `deployment` is null when nothing names one, because `cn brief` is silent then rather
// than failing: a hook on a machine without cairn costs nothing. A verb that needs the
// deployment goes through `connect()` in lib/client.mts, which is this plus the client
// and the one no-deployment sentence.

import { type Actor, actor as actorOf } from "./actor.mts";
import { can as canOf } from "./can.mts";
import { type CairnConfig, type Deployment, readConfig, resolveDeployment } from "./config.mts";

export type Session = {
  /** The config file as read, or null when there is none. */
  config: CairnConfig | null;
  deployment: Deployment | null;
  actor: Actor;
  /** What this session can do: the flag, then CAIRN_CAN, then the file. */
  can: string[];
};

/** The session this call runs as. `can` is the verb's --can, when it takes one. */
export function session(
  { can }: { can?: string[] } = {},
  env: NodeJS.ProcessEnv = process.env,
): Session {
  const config = readConfig(env);
  return {
    config,
    deployment: resolveDeployment(env, config),
    actor: actorOf(env, config),
    can: canOf(can, env, config),
  };
}
