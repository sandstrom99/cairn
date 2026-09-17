// config.mts: which deployment cn talks to.
//
//   import { resolveDeployment } from "../lib/config.mts";
//   const dep = resolveDeployment();   // { url, source } or null
//
// The rule for how a session resolves repo → project → deployment is deferred
// (docs/design.md §13); the lean is global config, since a project is coarse and
// path-derivation is out. What is settled is where that config lives and its shape,
// so nothing else has to move when the rule is decided:
//
//   CAIRN_URL                          wins, for hooks, crons and a one-off run
//   ~/.config/cairn/config.json        { "default": "invyte", "host": "wsl",
//                                        "can": ["web", "android"],
//                                        "deployments": { "invyte": { "url": "https://….convex.cloud",
//                                                                     "secret": "…" } } }
//
// `host` is this machine's name in an actor (lib/actor.mts) and `can` is what it can do,
// the fallback for `cn ready --can` (lib/can.mts); everything else about the file is
// which deployment to talk to.
//
// `secret` is the deployment's one shared secret, sent on every call and checked by
// `lib/guard.ts` in the deployment (docs/design.md §12). `CAIRN_SECRET` in the shell wins
// over the file, the same way `CAIRN_URL` does, so a hook or a one-off run can carry it.
// A deployment with no `CAIRN_SECRET` set on it checks nothing, which is what keeps the
// anonymous local deployment open. It fences a deployment, not an actor: identity auth is
// still §13.
//
// $XDG_CONFIG_HOME replaces ~/.config when set.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type DeploymentConfig = { url: string; secret?: string };
export type CairnConfig = {
  default?: string;
  /** What this machine calls itself in an actor name; the OS hostname when absent. */
  host?: string;
  /** What this machine can do: ios, android, web, device, decision. Advisory (§5). */
  can?: string[];
  deployments: Record<string, DeploymentConfig>;
};

export type Deployment = {
  name: string;
  url: string;
  source: "env" | "config";
  /** The shared secret to send, when this machine has one for the deployment. */
  secret?: string;
  secretSource?: "env" | "config";
};

/** `$XDG_CONFIG_HOME/cairn/config.json`, or `~/.config/cairn/config.json`. */
export const configPath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "cairn", "config.json");

/** The config file parsed, or null when there is none. A malformed file throws by path. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): CairnConfig | null {
  const file = configPath(env);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CairnConfig;
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`);
  }
}

/** The deployment to use, or null when nothing names one. */
export function resolveDeployment(env: NodeJS.ProcessEnv = process.env): Deployment | null {
  const fromEnv = env.CAIRN_SECRET
    ? { secret: env.CAIRN_SECRET, secretSource: "env" as const }
    : {};
  if (env.CAIRN_URL) return { name: "CAIRN_URL", url: env.CAIRN_URL, source: "env", ...fromEnv };
  const cfg = readConfig(env);
  if (!cfg) return null;
  const names = Object.keys(cfg.deployments ?? {});
  const name = cfg.default ?? (names.length === 1 ? names[0] : undefined);
  if (!name) return null;
  const dep = cfg.deployments[name];
  if (!dep?.url) throw new Error(`${configPath(env)}: deployment "${name}" has no url`);
  const fromConfig = dep.secret ? { secret: dep.secret, secretSource: "config" as const } : {};
  return { name, url: dep.url, source: "config", ...fromConfig, ...fromEnv };
}
