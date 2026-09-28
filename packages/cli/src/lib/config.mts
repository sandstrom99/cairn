// config.mts: which deployment cn talks to.
//
//   import { readConfig, resolveDeployment } from "../lib/config.mts";
//   const dep = resolveDeployment(env, readConfig(env));   // { url, source } or null
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
//                                                                     "secret": "…",
//                                                                     "secretCmd": "op read …" } } }
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
// still §13. `secretCmd` is the command `cn init --secret-cmd` ran to get it, kept beside
// it so `cn init --refresh` can run it again once the deployment's secret is rotated; it
// is a command, not a secret.
//
// The file is written by `cn init`, by `cn init --refresh` for one deployment's secret, and
// by hand, and by nothing else. What `cn init` guarantees is here, in `withDeployment`,
// `withSecret` and `writeConfig`: it is checked before it is written — the deployment
// answers and takes the secret, or the file is untouched — it adds a deployment and never
// replaces one, `--refresh` changes that one deployment's secret and nothing else, and
// the file lands mode 600 in a 700 directory, because the secret is in it.
//
// $XDG_CONFIG_HOME replaces ~/.config when set. The file is read by `readConfig`, once per
// call, in lib/session.mts, and handed to everything that derives a fact from it.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type DeploymentConfig = { url: string; secret?: string; secretCmd?: string };
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

/** What `cn init` was told, already validated by the verb. */
type NewDeployment = {
  name: string;
  url: string;
  secret?: string;
  /** The command that printed `secret`, for `cn init --refresh` to run again. */
  secretCmd?: string;
  host?: string;
  can?: string[];
  makeDefault: boolean;
};

/** `existing` with the deployment added. Pure; throws Error when the name is taken. */
export function withDeployment(existing: CairnConfig | null, input: NewDeployment): CairnConfig {
  const { name, url, secret, secretCmd, host, can, makeDefault } = input;
  const deployments = existing?.deployments ?? {};
  const taken = deployments[name];
  // The same refusal whether or not the url matches: which of the two the machine meant
  // is a person's call, and guessing it wrong silently retargets every verb.
  if (taken)
    throw new Error(
      `${name} is already a deployment in the config, at ${taken.url};` +
        " cn init adds, it does not replace. Edit the file to change it.",
    );
  return {
    ...existing,
    // The first deployment a file has is what every verb resolves to, so it is the
    // default whether or not --default was passed.
    ...(makeDefault || existing?.default === undefined ? { default: name } : {}),
    ...(host === undefined ? {} : { host }),
    ...(can === undefined ? {} : { can }),
    deployments: {
      ...deployments,
      [name]: {
        url,
        ...(secret === undefined ? {} : { secret }),
        ...(secretCmd === undefined ? {} : { secretCmd }),
      },
    },
  };
}

/**
 * `existing` with one deployment's `secret` and `secretCmd` replaced and everything else as
 * it was, for `cn init --refresh`. Pure; throws Error when the file has no such deployment.
 */
export function withSecret(
  existing: CairnConfig,
  name: string,
  next: { secret: string; secretCmd: string },
): CairnConfig {
  const deployments = existing.deployments ?? {};
  const dep = deployments[name];
  if (!dep)
    throw new Error(
      `${name} is not a deployment in the config; it has ${Object.keys(deployments).join(", ")}`,
    );
  return {
    ...existing,
    deployments: {
      ...deployments,
      [name]: { ...dep, secret: next.secret, secretCmd: next.secretCmd },
    },
  };
}

/** Writes the config 600 in a 700 directory, atomically, and returns its path. */
export function writeConfig(config: CairnConfig, env: NodeJS.ProcessEnv = process.env): string {
  const file = configPath(env);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, file);
    // A rename carries the new file's mode, but an older file at the path may have been
    // looser and this is the case that matters: the secret is in what just landed.
    chmodSync(file, 0o600);
  } catch (e) {
    rmSync(temp, { force: true });
    throw e;
  }
  return file;
}

/** The one sentence every verb and `cn doctor` say when nothing resolves. */
export function noDeploymentMessage(): string {
  return "no deployment: run `cn init` to set this machine up (cn init --help), or set CAIRN_URL";
}

/** The deployment to use, from the environment or the config as read, or null when nothing names one. */
export function resolveDeployment(
  env: NodeJS.ProcessEnv,
  cfg: CairnConfig | null,
): Deployment | null {
  const fromEnv = env.CAIRN_SECRET
    ? { secret: env.CAIRN_SECRET, secretSource: "env" as const }
    : {};
  if (env.CAIRN_URL) return { name: "CAIRN_URL", url: env.CAIRN_URL, source: "env", ...fromEnv };
  if (!cfg) return null;
  // A hand-edited file can lack the key altogether; that is a file with no deployments.
  const deployments = cfg.deployments ?? {};
  const names = Object.keys(deployments);
  const name = cfg.default ?? (names.length === 1 ? names[0] : undefined);
  if (!name) return null;
  const dep = deployments[name];
  if (!dep)
    throw new Error(`${configPath(env)}: default "${name}" names no deployment in the file`);
  if (!dep.url) throw new Error(`${configPath(env)}: deployment "${name}" has no url`);
  const fromConfig = dep.secret ? { secret: dep.secret, secretSource: "config" as const } : {};
  return { name, url: dep.url, source: "config", ...fromConfig, ...fromEnv };
}
