// session.mts: what one cn call is, read once.
//
//   import { session } from "../lib/session.mts";
//   const { deployment, actor } = session();
//
// A verb used to read ~/.config/cairn/config.json up to three times on its way to one
// call: once to resolve the deployment, once for the actor's host, and once more inside
// connect(). The file is read here, once, and both facts are derived from that one read:
// which deployment (lib/config.mts) and who is acting (lib/actor.mts). Each keeps its own
// rule and its own test; this is where they meet. `cn init` and `cn setting` read the file
// themselves, since each is about to write it, and they are the two verbs that do.
//
// `deployment` is null when nothing names one, because `cn brief` is silent then rather
// than failing: a hook on a machine without cairn costs nothing. A verb that needs the
// deployment goes through `connect()` in lib/client.mts, which is this plus the client
// and the one no-deployment sentence.

import { type Actor, actor as actorOf } from "./actor.mts";
import { type CairnConfig, type Deployment, readConfig, resolveDeployment } from "./config.mts";

export type Session = {
  /** The config file as read, or null when there is none. */
  config: CairnConfig | null;
  deployment: Deployment | null;
  actor: Actor;
};

/** The session this call runs as. */
export function session(env: NodeJS.ProcessEnv = process.env): Session {
  const config = readConfig(env);
  return {
    config,
    deployment: resolveDeployment(env, config),
    actor: actorOf(env, config),
  };
}
