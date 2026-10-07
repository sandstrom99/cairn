// cn init — set this machine up: write the config for a deployment.
//
//   cn init --name <name> --url <url> [--secret-cmd '<command>'] [--host <name>] [--default]
//   cn init --refresh [--name <name>] [--secret-cmd '<command>']
//
// For a machine with no config at all, and for adding a second deployment to one that
// already has a file. It adds and never replaces: a name the file already carries is
// refused. The one change it makes to a deployment that exists is its secret, with
// --refresh; any other change to one is an edit to the file by hand.
//
// --name is what the deployment is called, in the file and in `cn doctor`: lowercase
// letters, digits and dashes, and usually the company or the repository whose worklist it
// is. --url is the Convex deployment URL, the `https://….convex.cloud` one.
//
// --secret-cmd is a command whose stdout is the deployment's shared secret, run once,
// here — `op read "op://<vault>/<item>/secret"` and the like. The secret is never an
// argument, so it is not in a shell history and not in an agent's transcript, and cn
// never prints it. The command is kept beside the secret, as `secretCmd`, so --refresh can
// run it again; it is a command, not a secret. CAIRN_SECRET in the environment is the
// other way in; with neither, the deployment is taken to be open, which is what the
// anonymous local one is.
//
// --host is what this machine calls itself in an actor name, `<host>/claude` on every
// claim. When absent it is the OS hostname up to its first dot, lowercased. cairn runs on
// trust, so this name is also what tells one person's agents from a colleague's: one
// that carries the person's name as well as the machine's, `harbor-mac-mini` or
// `maya-wsl`, reads best. Nothing checks it.
// --default makes this deployment the one every verb resolves to, for a file that already
// names another; the first deployment in a fresh file is the default either way.
//
// --refresh takes a rotated secret onto this machine. It re-runs the command the
// deployment stores, or the --secret-cmd given, which then replaces the stored one: that
// is how a machine set up before commands were kept takes its first. It checks that the
// deployment accepts what the command printed. --name is the deployment; when absent, the
// one CAIRN_DEPLOYMENT names, then the file's default. CAIRN_SECRET plays no part: the file
// is what gets fixed. It rewrites that deployment's secret in `secrets/<name>` and its
// command in the file, moves a secret an older cn cached in the file to its own, and
// changes nothing else.
//
// It checks before it writes. The deployment has to answer, and where a secret was found
// it has to be accepted; a check that fails writes nothing and says what to fix. What it
// writes is `~/.config/cairn/config.json`, or `$XDG_CONFIG_HOME/cairn/config.json` where
// that is set, which names the deployment and the command and never the secret, and
// `~/.config/cairn/secrets/<name>`, which is the secret alone; both mode 600. The file is
// what an agent reads to see how a machine is set up, so nothing in it is a secret.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { maybe, onlyFlags } from "../lib/flags.mts";
import { UsageError, checkLine, say } from "../lib/cli.mts";
import {
  type CairnConfig,
  configPath,
  readConfig,
  removeSecret,
  withDeployment,
  withSecretCmd,
  writeConfig,
  writeSecret,
} from "../lib/config.mts";
import { ping } from "../lib/ping.mts";
import { captureStdout } from "../lib/run.mts";

export const name = "init";
export const summary = "set this machine up: write the config for a deployment";
export const spec = {
  bool: ["default", "refresh"],
  value: ["name", "url", "secret-cmd", "host"],
} as const satisfies ArgSpec;

const NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Where the secret comes from. Decided here; the command itself runs in `run`. */
type SecretFrom =
  | { from: "--secret-cmd"; command: string }
  | { from: "CAIRN_SECRET"; value: string }
  | { from: "none" };

type Parsed =
  | {
      action: "init";
      name: string;
      url: string;
      secret: SecretFrom;
      host?: string;
      makeDefault: boolean;
    }
  | { action: "refresh"; name?: string; command?: string };

/** The url as it will be stored: a real http(s) URL, with no trailing slash. */
function checkUrl(given: string): string {
  let url: URL;
  try {
    url = new URL(given);
  } catch {
    throw new UsageError(`--url is the deployment's URL, not "${given}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new UsageError(`--url is http or https, not "${given}"`);
  return given.replace(/\/+$/, "");
}

export function parse(argv: string[], env: NodeJS.ProcessEnv = process.env): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  onlyFlags(pos, "cn init --name <name> --url <url>");

  const deployment = opts.name;
  const badName = (given: string) =>
    new UsageError(`--name is lowercase letters, digits and dashes, not "${given}"`);

  if (opts.refresh) {
    // Everything else about a deployment is set up once and edited by hand; --refresh is
    // the secret alone, so a flag that would change more is refused rather than dropped.
    const other = (
      [
        ["url", opts.url !== undefined],
        ["host", opts.host !== undefined],
        ["default", opts.default],
      ] as const
    ).find(([, given]) => given);
    if (other)
      throw new UsageError(
        `cn init --refresh takes --name and --secret-cmd alone, not --${other[0]}`,
      );
    if (deployment !== undefined && !NAME.test(deployment)) throw badName(deployment);
    return {
      action: "refresh",
      ...maybe("name", deployment),
      ...maybe("command", opts["secret-cmd"] || undefined),
    };
  }

  if (!deployment)
    throw new UsageError("cn init --name <name> --url <url>: --name is what to call it here");
  if (!NAME.test(deployment)) throw badName(deployment);

  const given = opts.url;
  if (!given)
    throw new UsageError("cn init --name <name> --url <url>: --url is the deployment's URL");

  // --secret-cmd wins over CAIRN_SECRET, because it is the one the person just typed.
  const command = opts["secret-cmd"];
  const secret: SecretFrom = command
    ? { from: "--secret-cmd", command }
    : env.CAIRN_SECRET
      ? { from: "CAIRN_SECRET", value: env.CAIRN_SECRET }
      : { from: "none" };

  return {
    action: "init",
    name: deployment,
    url: checkUrl(given),
    secret,
    ...maybe("host", opts.host),
    makeDefault: opts.default,
  };
}

const ok = (line: string) => console.log(checkLine(true, line));
const bad = (line: string) => console.log(checkLine(false, line));

/**
 * The secret a command prints, or undefined once it has said why there is none. Its
 * stderr is shown when it fails, and never its stdout: stdout is the secret whatever the
 * exit code was.
 */
function secretFrom(command: string): string | undefined {
  const result = captureStdout(command);
  if (result.exitCode !== 0) {
    bad(`the secret command exited ${result.exitCode}`);
    for (const line of result.stderr.split("\n")) if (line.trim()) console.log(`  ${line}`);
    return undefined;
  }
  if (result.stdout === "") {
    bad("the secret command printed nothing");
    return undefined;
  }
  return result.stdout;
}

/**
 * `cn init --refresh`: one deployment's secret, from its stored command or the one given,
 * checked against the deployment and written with nothing else in the file changed.
 */
async function refresh(parsed: { name?: string; command?: string }): Promise<number> {
  const path = configPath();
  const existing = readConfig();
  if (!existing) {
    bad(`no config at ${path}: cn init --name <name> --url <url> sets this machine up first`);
    return 1;
  }
  const deployments = existing.deployments ?? {};
  const names = Object.keys(deployments);
  const name =
    parsed.name ??
    (process.env.CAIRN_DEPLOYMENT || undefined) ??
    existing.default ??
    (names.length === 1 ? names[0] : undefined);
  if (name === undefined) {
    bad(`${path} has no default; pass --name, one of ${names.join(", ")}`);
    return 1;
  }
  const dep = deployments[name];
  if (!dep) {
    bad(`${name} is not a deployment in ${path}; it has ${names.join(", ")}`);
    return 1;
  }
  const command = parsed.command ?? dep.secretCmd;
  if (command === undefined) {
    bad(
      `${name} stores no secret command; pass --secret-cmd '<command>' once, and cn init --refresh keeps it`,
    );
    return 1;
  }

  const secret = secretFrom(command);
  if (secret === undefined) return 1;

  const answer = await ping({ url: dep.url, secret });
  if (!answer.answered) {
    bad(
      answer.refused
        ? `${dep.url} refused the secret the command printed; nothing written`
        : `${dep.url} did not answer: ${answer.message}; nothing written`,
    );
    return 1;
  }
  ok(`${name} → ${dep.url} answered: ${answer.projects} project(s)`);
  ok(
    `secret accepted (from ${parsed.command === undefined ? "the stored command" : "--secret-cmd"})`,
  );
  ok(`wrote ${writeSecret(name, secret)} (mode 600)`);
  ok(`wrote ${writeConfig(withSecretCmd(existing, name, command))} (mode 600)`);
  return 0;
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "refresh") return refresh(parsed);

  // The file first: a name that is taken fails here, offline and in the time it takes to
  // read one file, before a secret command has made anybody unlock anything. A file that
  // cannot be parsed throws out of readConfig and is reported like any other error; cn
  // init does not guess at it. This is the one verb that reads the file itself rather
  // than through the session, because it is about to write it.
  const existing = readConfig();
  let next: CairnConfig;
  try {
    next = withDeployment(existing, {
      name: parsed.name,
      url: parsed.url,
      ...maybe(
        "secretCmd",
        parsed.secret.from === "--secret-cmd" ? parsed.secret.command : undefined,
      ),
      ...maybe("host", parsed.host),
      makeDefault: parsed.makeDefault,
    });
  } catch (e) {
    bad((e as Error).message);
    return 1;
  }

  // Then the secret, which needs neither the network nor the file.
  let secret: string | undefined;
  if (parsed.secret.from === "--secret-cmd") {
    secret = secretFrom(parsed.secret.command);
    if (secret === undefined) return 1;
  } else if (parsed.secret.from === "CAIRN_SECRET") {
    secret = parsed.secret.value;
  }

  // The check is `cn doctor`'s ping against a deployment that is not in the file yet, so
  // what gets written is a deployment that answered once. The secret is struck from the
  // message of a deployment that did not answer before it is printed (lib/ping.mts).
  const answer = await ping({ url: parsed.url, ...maybe("secret", secret) });
  if (!answer.answered) {
    bad(
      !answer.refused
        ? `${parsed.url} did not answer: ${answer.message}; nothing written`
        : secret === undefined
          ? `${parsed.url} needs a secret: pass --secret-cmd, or set CAIRN_SECRET; nothing written`
          : `${parsed.url} refused the secret; nothing written`,
    );
    return 1;
  }
  ok(`${parsed.name} → ${parsed.url} answered: ${answer.projects} project(s)`);
  if (secret !== undefined) ok(`secret accepted (from ${parsed.secret.from})`);

  // The secret lands first, so a config naming a deployment never exists without its
  // secret beside it. An open deployment set up under a name that once had one drops it.
  if (secret !== undefined) ok(`wrote ${writeSecret(parsed.name, secret)} (mode 600)`);
  else removeSecret(parsed.name);
  ok(`wrote ${writeConfig(next)} (mode 600)`);
  if (next.default !== parsed.name)
    say(
      `${parsed.name} is not the default; ${next.default} still is. Pass --default to change that.`,
    );
  say(
    next.default === parsed.name
      ? "the next session on this machine starts with cn brief"
      : `a session starts with its brief where the repository's settings set CAIRN_DEPLOYMENT=${parsed.name}`,
  );
  return 0;
}
