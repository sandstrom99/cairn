// new-cloud.mjs: a company's Convex project and its development deployment, made from here.
//
//   vp run -F @cairn/backend new:cloud -- <name> [--team <team>] [--project <project>]
//   import { newCloud } from "./new-cloud.mjs"                   the e2e row, with a stand-in convex
//
// `<name>` is what `cn init` will call the deployment, and the project is `cairn-<name>`
// unless `--project` names another. `--team` picks the team when the login has more than
// one. The script writes `backend/.env.cloud.<name>.local`, which is what `#push:cloud`,
// `#dev:cloud` and `#secret` read (clouds.mjs), and leaves `backend/.env.local` as it was.
//
// Creation is `convex dev --once --configure new --project <p> --dev-deployment cloud
// --skip-push [--team <t>]`. In convex 1.46 that is the one call that creates a project
// and its dev deployment together without asking anything. `--team`, `--project`,
// `--dev-deployment` and `--skip-push` are hidden from `--help` but real
// (node_modules/convex/src/cli/dev.ts, around lines 118-154).
//
// `--skip-push`, because nothing may run on the new deployment until `#secret -- new` has
// set its `CAIRN_SECRET`: the guard (convex/lib/guard.ts) checks nothing on a deployment
// with no secret, so functions pushed first would answer anyone holding its URL.
// `#push:cloud` pushes once the secret is set.
//
// convex runs with stdin closed and its stdout on this process's stderr. convex offers to
// write its AI files, an AGENTS.md, guidelines and agent skills, into the repository only
// when stdin is a terminal (convex/src/cli/lib/aiFiles/utils.ts, `isInInteractiveTerminal`),
// and with none every other prompt fails at once, `Cannot prompt for input in
// non-interactive terminals`, rather than waiting for an answer nobody gives. This script
// prints nothing on stdout, like cloud.mjs.
//
// convex's environment drops `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOY_KEY`,
// `CONVEX_DEPLOYMENT_TOKEN`, `CONVEX_URL` and `CONVEX_AGENT_MODE`: a deploy key would stand
// in for the login and act on its own deployment, and `CONVEX_AGENT_MODE=anonymous` would
// make a local deployment instead of a cloud one. `CONVEX_OVERRIDE_ACCESS_TOKEN` and the
// rest pass through.
//
// convex writes the deployment it made into `.env.local` in its working directory, with a
// `# team: <t>, project: <p>` comment on the same line. The script reads the deployment and
// its URL from there, writes the cloud file, and puts `.env.local` back byte for byte, or
// removes it when there was none, whichever way convex ends: convexStatus hands SIGINT and
// SIGTERM to convex while it runs, and a listener replaces node's default exit, so this
// process outlives convex and its `finally` restores the file.
//
// It is the project's development deployment, which the login alone can push to. A
// production one would need `convex deploy` and a deploy key, and buys a worklist nothing
// yet (docs/design.md §13).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { convexStatus, holdEnvLocal, packageRoot } from "./run-convex.mjs";

const USAGE =
  "usage: vp run -F @cairn/backend new:cloud -- <name> [--team <team>] [--project <project>]";
/** A deployment's name as `cn init --name` takes it, and as clouds.mjs reads it from a file name. */
const NAME = /^[a-z0-9][a-z0-9-]*$/;
/** What convex's environment must not carry: each would pick a deployment, or a kind of one. */
const DROPPED = [
  "CONVEX_DEPLOYMENT",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_URL",
  "CONVEX_AGENT_MODE",
];

/**
 * The first token an env file gives `name`, or undefined: quotes and a trailing `# …`
 * comment aside, which `valueIn` would keep as part of the value.
 */
const tokenIn = (text, name) =>
  text?.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^\\s"'#]+)`, "m"))?.[1];

/** The `team: <t>, project: <p>` convex writes after `CONVEX_DEPLOYMENT` on its line. */
const commentIn = (text) => text?.match(/^\s*CONVEX_DEPLOYMENT\s*=.*?#\s*(team: .+?)\s*$/m)?.[1];

/** An env file's text, or undefined with no file. */
const textOf = (file) => (existsSync(file) ? readFileSync(file, "utf8") : undefined);

/** Whether this machine is logged in to Convex, the way convex itself decides it. */
function loggedIn(env) {
  if (env.CONVEX_OVERRIDE_ACCESS_TOKEN) return true;
  const config = join(env.HOME ?? homedir(), ".convex", "config.json");
  try {
    const { accessToken } = JSON.parse(readFileSync(config, "utf8"));
    return typeof accessToken === "string" && accessToken !== "";
  } catch {
    return false;
  }
}

/**
 * Creates the Convex project `project` in `team`, or the login's own, with a development
 * deployment and nothing pushed to it, and writes `.env.cloud.<name>.local` in `dir`
 * naming that deployment. `.env.local` in `dir` is as it was afterwards, whatever happened.
 * `run` is how convex runs, `(args, { cwd, env })` to its exit status; `err` receives every
 * line, and nothing goes to stdout.
 *
 * @param {{ name: string, team?: string, project?: string, dir?: string, env?: NodeJS.ProcessEnv, run?: (args: string[], options: { cwd: string, env: NodeJS.ProcessEnv }) => Promise<number>, err?: (line: string) => void }} options
 * @returns {Promise<0 | 1 | 2>} 0 once the deployment is made and its file written, 2 for a
 *   refusal before anything ran, 1 when this machine is not logged in or convex failed
 */
export async function newCloud({
  name,
  team,
  project = `cairn-${name}`,
  dir = packageRoot,
  env = process.env,
  run = (args, { cwd, env: childEnv }) =>
    convexStatus(args, { cwd, env: childEnv, stdio: ["ignore", 2, 2] }),
  err = (line) => console.error(line),
}) {
  if (!NAME.test(name)) {
    err(
      `the name is lowercase letters, digits and dashes, as cn init --name takes it, not "${name}"`,
    );
    return 2;
  }
  const envFile = `.env.cloud.${name}.local`;
  const cloudFile = join(dir, envFile);
  if (existsSync(cloudFile)) {
    err(
      `backend/${envFile} exists: this checkout already keeps a deployment called ${name}; nothing created`,
    );
    return 2;
  }
  if (!loggedIn(env)) {
    err(
      "not logged in to Convex on this machine: npx convex login, from backend/, logs in; nothing created",
    );
    return 1;
  }

  err(`creating Convex project ${project} for ${name}${team ? ` in team ${team}` : ""}`);
  const envLocal = join(dir, ".env.local");
  const restore = holdEnvLocal(envLocal);
  const held = tokenIn(textOf(envLocal), "CONVEX_DEPLOYMENT");
  try {
    const childEnv = { ...env };
    for (const key of DROPPED) delete childEnv[key];
    const args = [
      "dev",
      "--once",
      "--configure",
      "new",
      "--project",
      project,
      "--dev-deployment",
      "cloud",
      "--skip-push",
      ...(team ? ["--team", team] : []),
    ];
    const status = await run(args, { cwd: dir, env: childEnv });

    const written = textOf(envLocal);
    const deployment = tokenIn(written, "CONVEX_DEPLOYMENT");
    if (deployment === undefined || deployment === held) {
      err(`convex created nothing (exit ${status}); nothing written`);
      return 1;
    }
    const url = tokenIn(written, "CONVEX_URL");
    if (url === undefined) {
      err(`convex made ${deployment} but wrote no CONVEX_URL; nothing written`);
      return 1;
    }
    const comment = commentIn(written);
    const lines = [
      `# The cloud deployment cn init calls ${name}, made by #new:cloud. #push:cloud, #dev:cloud and #secret read this.`,
      ...(comment === undefined ? [] : [`# ${comment}`]),
      `CONVEX_DEPLOYMENT=${deployment}`,
      `CONVEX_URL=${url}`,
    ];
    writeFileSync(cloudFile, lines.map((line) => `${line}\n`).join(""));
    err(`created ${name}: ${deployment} at ${url}, in backend/${envFile}`);
    if (status !== 0) err(`convex exited ${status} after creating it; the file is written`);
    err(
      `next: vp run -F @cairn/backend secret -- new ${name} --op "op://<vault>/cairn ${name} deployment"`,
    );
    return status === 0 ? 0 : 1;
  } finally {
    restore();
  }
}

/** The command line, and `newCloud` against this package's own directory. */
async function main(argv) {
  // vp hands on the `--` that separates its own flags from the script's.
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: { team: { type: "string" }, project: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    process.stderr.write(`${e.message}\n${USAGE}\n`);
    return 2;
  }
  if (parsed.positionals.length !== 1) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const [name] = parsed.positionals;
  return newCloud({ name, team: parsed.values.team, project: parsed.values.project });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
