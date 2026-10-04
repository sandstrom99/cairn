// config.mts: which deployment cn talks to.
//
//   import { readConfig, resolveDeployment } from "../lib/config.mts";
//   const dep = resolveDeployment(env, readConfig(env));   // { url, source } or null
//
// Three things name the deployment, in this order, and the first that does wins
// (docs/design.md §13). A project is coarse, so nothing is derived from the path:
//
//   CAIRN_URL                          wins, for hooks, crons and a one-off run
//   CAIRN_DEPLOYMENT                   names one deployment in the file below, and takes
//                                      its url and secret; a repository sets it in the
//                                      env of its Claude settings
//   ~/.config/cairn/config.json        { "default": "acme", "host": "wsl",
//                                        "deployments": { "acme": { "url": "https://….convex.cloud",
//                                                                   "secretCmd": "op read …" } } }
//   ~/.config/cairn/secrets/<name>     that deployment's secret, one file each, mode 600
//
// A CAIRN_DEPLOYMENT the file lacks is an error naming the deployments it has, never a
// fall back to the default: the repository asked for one worklist, and writing to another
// is worse than failing.
//
// `host` is this machine's name in an actor (lib/actor.mts), and `settings` is what the
// machine has turned on, whichever deployment a call goes to (lib/settings.mts);
// everything else about the file is which deployment to talk to. A file written before capabilities went (cn-118)
// may still hold `can`; it loads, and nothing reads it.
//
// The secret is the deployment's one shared secret, sent on every call and checked by
// `lib/guard.ts` in the deployment (docs/design.md §12). It is in `secrets/<name>`, not
// the file: the file is what an agent reads to see how a machine is set up, so it holds
// nothing that cannot be printed. A `secret` key still in the file was cached by a cn from
// before; it is read until `cn init --refresh` moves it, and never written again.
// `CAIRN_SECRET` in the shell wins over both, as `CAIRN_URL` does. A deployment with no
// `CAIRN_SECRET` set on it checks nothing, which keeps the anonymous local one open; it
// fences a deployment, not an actor (§13). `secretCmd` is a command, not a secret.
//
// The file is written by `cn init`, by `cn init --refresh`, by `cn setting`, and by hand. What `cn init`
// guarantees is here, in `withDeployment`, `withSecretCmd` and `writeConfig`: checked
// before written, a deployment added and never replaced, `--refresh` changing one
// deployment's secret and command. `writeConfig` strips any `secret` it is handed into
// `secrets/<name>`, so the file never carries one once cn has written it; it still lands
// 600 in a 700 directory, because it names where the secrets are and what prints them.
//
// $XDG_CONFIG_HOME replaces ~/.config. `readConfig` reads the file once per call, in
// lib/session.mts; `resolveDeployment` also reads `secrets/<name>`, so it takes env.

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

type DeploymentConfig = {
  url: string;
  secretCmd?: string;
  /** A secret an older cn cached in the file: read until `cn init --refresh` moves it to secrets/<name>, never written. */
  secret?: string;
};
export type CairnConfig = {
  default?: string;
  /** What this machine calls itself in an actor name; the OS hostname when absent. */
  host?: string;
  /** Each setting's state; a setting that is off is absent (lib/settings.mts). */
  settings?: Record<string, unknown>;
  deployments: Record<string, DeploymentConfig>;
};

export type Deployment = {
  name: string;
  url: string;
  /** What chose the deployment: the environment's URL, its name, or the file's default. */
  source: "CAIRN_URL" | "CAIRN_DEPLOYMENT" | "default";
  /** The shared secret to send, when this machine has one for the deployment. */
  secret?: string;
  /** env is CAIRN_SECRET, file is secrets/<name>, config is a secret still cached in config.json. */
  secretSource?: "env" | "file" | "config";
};

/** `$XDG_CONFIG_HOME/cairn`, or `~/.config/cairn`. */
export const configDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "cairn");

/** `$XDG_CONFIG_HOME/cairn/config.json`, or `~/.config/cairn/config.json`. */
export const configPath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(configDir(env), "config.json");

/** Where this machine keeps one deployment's secret: `secrets/<name>` beside the config. */
export const secretPath = (name: string, env: NodeJS.ProcessEnv = process.env): string =>
  join(configDir(env), "secrets", name);

/** What a deployment is called; anything else in a hand-edited file is never a path. */
const NAME = /^[a-z0-9][a-z0-9-]*$/;

/** The secret this machine keeps for `name`, or undefined when there is none. */
export function readSecret(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!NAME.test(name)) return undefined;
  const file = secretPath(name, env);
  if (!existsSync(file)) return undefined;
  const text = readFileSync(file, "utf8");
  return text.trim() === "" ? undefined : text.replace(/\r?\n$/, "");
}

/** `secretPath`, refusing a name that would make it anything but a file in `secrets/`. */
function secretFile(name: string, env: NodeJS.ProcessEnv): string {
  if (!NAME.test(name))
    throw new Error(
      `${name} is not a deployment name cn keeps a secret for: lowercase letters, digits and dashes`,
    );
  return secretPath(name, env);
}

/** Writes one deployment's secret 600 in a 700 directory, atomically, and returns its path. */
export function writeSecret(
  name: string,
  secret: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const file = secretFile(name, env);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(temp, `${secret}\n`, { mode: 0o600 });
    renameSync(temp, file);
    // A rename carries the new file's mode, but an older file at the path may have been
    // looser, and what just landed is a secret.
    chmodSync(file, 0o600);
  } catch (e) {
    rmSync(temp, { force: true });
    throw e;
  }
  return file;
}

/** Removes one deployment's secret, if this machine keeps one. */
export function removeSecret(name: string, env: NodeJS.ProcessEnv = process.env): void {
  rmSync(secretFile(name, env), { force: true });
}

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
  /** The command that printed the secret, for `cn init --refresh` to run again. */
  secretCmd?: string;
  host?: string;
  makeDefault: boolean;
};

/** `existing` with the deployment added. Pure; throws Error when the name is taken. */
export function withDeployment(existing: CairnConfig | null, input: NewDeployment): CairnConfig {
  const { name, url, secretCmd, host, makeDefault } = input;
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
    deployments: {
      ...deployments,
      [name]: {
        url,
        ...(secretCmd === undefined ? {} : { secretCmd }),
      },
    },
  };
}

/**
 * `existing` with one deployment's `secretCmd` replaced, a secret still cached on it
 * dropped, and everything else as it was, for `cn init --refresh`. Pure; throws Error
 * when the file has no such deployment.
 */
export function withSecretCmd(existing: CairnConfig, name: string, secretCmd: string): CairnConfig {
  const deployments = existing.deployments ?? {};
  const dep = deployments[name];
  if (!dep)
    throw new Error(
      `${name} is not a deployment in the config; it has ${Object.keys(deployments).join(", ")}`,
    );
  const { secret: _cached, ...kept } = dep;
  return {
    ...existing,
    deployments: { ...deployments, [name]: { ...kept, secretCmd } },
  };
}

/**
 * Writes the config 600 in a 700 directory, atomically, and returns its path. A `secret`
 * it is handed goes to `secrets/<name>` first and never into the file.
 */
export function writeConfig(config: CairnConfig, env: NodeJS.ProcessEnv = process.env): string {
  const file = configPath(env);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  // A secrets file that holds a secret wins over one cached inline: a refresh wrote it,
  // so it is the newer of the two.
  const stripped: CairnConfig = config.deployments
    ? {
        ...config,
        deployments: Object.fromEntries(
          Object.entries(config.deployments).map(([name, dep]) => {
            const { secret, ...kept } = dep;
            if (secret !== undefined && readSecret(name, env) === undefined)
              writeSecret(name, secret, env);
            return [name, kept];
          }),
        ),
      }
    : config;
  const temp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(temp, `${JSON.stringify(stripped, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, file);
    // A rename carries the new file's mode, but an older file at the path may have been
    // looser, and what the file names is nobody else's: where the secrets are and the
    // commands that print them.
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

/** The secret this machine holds for a deployment in the file, and where it came from. */
function secretOf(
  name: string,
  dep: DeploymentConfig,
  env: NodeJS.ProcessEnv,
): Pick<Deployment, "secret" | "secretSource"> {
  const kept = readSecret(name, env);
  if (kept !== undefined) return { secret: kept, secretSource: "file" };
  return dep.secret ? { secret: dep.secret, secretSource: "config" } : {};
}

/** The deployment to use, from the environment or the config as read, or null when nothing names one. */
export function resolveDeployment(
  env: NodeJS.ProcessEnv,
  cfg: CairnConfig | null,
): Deployment | null {
  const fromEnv = env.CAIRN_SECRET
    ? { secret: env.CAIRN_SECRET, secretSource: "env" as const }
    : {};
  if (env.CAIRN_URL)
    return { name: "CAIRN_URL", url: env.CAIRN_URL, source: "CAIRN_URL", ...fromEnv };
  // An empty value is unset, the way a settings file clears what another one set.
  const named = env.CAIRN_DEPLOYMENT || undefined;
  if (named !== undefined) {
    const setup = `cn init --name ${named} sets it up (cn init --help)`;
    if (!cfg)
      throw new Error(
        `CAIRN_DEPLOYMENT is ${named}, and this machine has no cairn config: ${setup}`,
      );
    const deployments = cfg.deployments ?? {};
    const dep = deployments[named];
    if (!dep) {
      const names = Object.keys(deployments);
      const list = names.length > 0 ? names.join(", ") : "none";
      throw new Error(
        `CAIRN_DEPLOYMENT is ${named}, and this machine has no deployment by that name (it has ${list}): ${setup}`,
      );
    }
    if (!dep.url) throw new Error(`${configPath(env)}: deployment "${named}" has no url`);
    return {
      name: named,
      url: dep.url,
      source: "CAIRN_DEPLOYMENT",
      ...secretOf(named, dep, env),
      ...fromEnv,
    };
  }
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
  return { name, url: dep.url, source: "default", ...secretOf(name, dep, env), ...fromEnv };
}
