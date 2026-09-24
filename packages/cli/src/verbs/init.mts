// cn init — set this machine up: write the config for a deployment.
//
//   cn init --name <name> --url <url> [--secret-cmd '<command>']
//           [--can ios android web device] [--host <name>] [--default]
//
// For a machine with no config at all, and for adding a second deployment to one that
// already has a file. It adds and never replaces: a name the file already carries is
// refused, and changing a deployment that exists is an edit to the file by hand.
//
// --name is what the deployment is called, in the file and in `cn doctor`: lowercase
// letters, digits and dashes, and usually the company or the repository whose worklist it
// is. --url is the Convex deployment URL, the `https://….convex.cloud` one.
//
// --secret-cmd is a command whose stdout is the deployment's shared secret, run once,
// here — `op read "op://<vault>/<item>/secret"` and the like. The secret is never an
// argument, so it is not in a shell history and not in an agent's transcript, and cn
// never prints it. CAIRN_SECRET in the environment is the other way in; with neither, the
// deployment is taken to be open, which is what the anonymous local one is.
//
// --can is what this machine can do: ios, android, web, device. It is the fallback for
// `cn ready --can`, and it is a machine's capability, so `decision` is not one of them.
// --host is what this machine calls itself in an actor name, the OS hostname when absent.
// --default makes this deployment the one every verb resolves to, for a file that already
// names another; the first deployment in a fresh file is the default either way.
//
// It checks before it writes. The deployment has to answer, and where a secret was found
// it has to be accepted; a check that fails writes nothing and says what to fix. What it
// writes is `~/.config/cairn/config.json`, or `$XDG_CONFIG_HOME/cairn/config.json` where
// that is set, mode 600, because the secret is in it.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { maybe, onlyFlags } from "../lib/flags.mts";
import { UsageError, checkLine, say } from "../lib/cli.mts";
import { type CairnConfig, readConfig, withDeployment, writeConfig } from "../lib/config.mts";
import { ping } from "../lib/ping.mts";
import { captureStdout } from "../lib/run.mts";

export const name = "init";
export const summary = "set this machine up: write the config for a deployment";
export const spec = {
  bool: ["default"],
  value: ["name", "url", "secret-cmd", "host"],
  list: ["can"],
} as const satisfies ArgSpec;

const NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Where the secret comes from. Decided here; the command itself runs in `run`. */
type SecretFrom =
  | { from: "--secret-cmd"; command: string }
  | { from: "CAIRN_SECRET"; value: string }
  | { from: "none" };

type Parsed = {
  action: "init";
  name: string;
  url: string;
  secret: SecretFrom;
  host?: string;
  can?: string[];
  makeDefault: boolean;
};

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
  if (!deployment)
    throw new UsageError("cn init --name <name> --url <url>: --name is what to call it here");
  if (!NAME.test(deployment))
    throw new UsageError(`--name is lowercase letters, digits and dashes, not "${deployment}"`);

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

  // An empty list is not an answer about what the machine can do.
  const can = opts.can && opts.can.length > 0 ? opts.can : undefined;
  return {
    action: "init",
    name: deployment,
    url: checkUrl(given),
    secret,
    ...maybe("host", opts.host),
    ...maybe("can", can),
    makeDefault: opts.default,
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const ok = (line: string) => console.log(checkLine(true, line));
  const bad = (line: string) => console.log(checkLine(false, line));

  // The file first: a name that is taken fails here, offline and in the time it takes to
  // read one file, before a secret command has made anybody unlock anything. A file that
  // cannot be parsed throws out of readConfig and is reported like any other error; cn
  // init does not guess at it. This is the one verb that reads the file itself rather
  // than through the session, because it is about to write it.
  const existing = readConfig();
  const build = (secret?: string): CairnConfig =>
    withDeployment(existing, {
      name: parsed.name,
      url: parsed.url,
      ...maybe("secret", secret),
      ...maybe("host", parsed.host),
      ...maybe("can", parsed.can),
      makeDefault: parsed.makeDefault,
    });
  try {
    build();
  } catch (e) {
    bad((e as Error).message);
    return 1;
  }

  // Then the secret, which needs neither the network nor the file.
  let secret: string | undefined;
  if (parsed.secret.from === "--secret-cmd") {
    const result = captureStdout(parsed.secret.command);
    if (result.exitCode !== 0) {
      bad(`the secret command exited ${result.exitCode}`);
      // Its stderr, and never its stdout: stdout is the secret whatever the exit code was.
      for (const line of result.stderr.split("\n")) if (line.trim()) console.log(`  ${line}`);
      return 1;
    }
    if (result.stdout === "") {
      bad("the secret command printed nothing");
      return 1;
    }
    secret = result.stdout;
  } else if (parsed.secret.from === "CAIRN_SECRET") {
    secret = parsed.secret.value;
  }
  const next = build(secret);

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

  ok(`wrote ${writeConfig(next)} (mode 600)`);
  if (next.default !== parsed.name)
    say(
      `${parsed.name} is not the default; ${next.default} still is. Pass --default to change that.`,
    );
  say("the next session on this machine starts with cn brief");
  return 0;
}
