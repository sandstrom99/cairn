// verify-evals.mjs: the plugin's eval suite, run for real against a worklist it seeds.
//
//   vp run verify:evals
//
// `claude plugin eval` starts each case as a fresh `claude -p` session with only the cairn
// plugin loaded, in a temporary HOME and cwd, and that child inherits only PATH,
// ANTHROPIC_*, CLAUDE_CODE_* and EVAL_* from this process. CAIRN_URL never reaches it, and
// neither does ~/.config/cairn, so the one way a deployment reaches the child is a `cn` on
// PATH: this writes a wrapper that sets the throwaway's environment and execs the real
// one, and puts its directory first. The plugin's SessionStart hook runs in the child and
// finds that same wrapper, so the brief the case starts with is the throwaway's brief.
//
// Every case sees the one worklist seeded below, from an empty deployment, so the ids a
// grader names are the ids that get minted: ep-1, then app-1 to app-4. The seed is
// asserted before the suite starts, since a run that grades the wrong worklist still
// costs a run.
//
// Each run is a `claude -p` child on this account's credential, plus the judge calls of
// every llm grader, so this is run by hand when the evals or the skill's rules change,
// never by CI. It never touches the worklist or the local copy on 3210: the target is
// only ever the deployment this script started, and `cn` reads a config home it starts
// empty. Results land under plugins/cairn/evals/results/, which is gitignored.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startThrowaway } from "../backend/scripts/throwaway.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CN = join(root, "packages", "cli", "bin", "cn");
const PLUGIN = join(root, "plugins", "cairn");
const EVALS = join(PLUGIN, "evals");

/** The deployment under test, the empty config home cn reads, and the wrapper's directory. */
let url;
let xdg;
let bin;

/** This process's environment with nothing of this machine's cairn or Claude session in it. */
function clean() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("CAIRN_")) delete env[key];
  delete env.CLAUDECODE;
  delete env.CLAUDE_ENV_FILE;
  return env;
}

/**
 * `line` split the way a shell splits a command: on whitespace, with a single- or
 * double-quoted span held together as one word and the quotes themselves dropped.
 */
function words(line) {
  const out = [];
  let word = "";
  let quote = null;
  let quoted = false;
  for (const ch of line) {
    if (quote !== null) {
      if (ch === quote) quote = null;
      else word += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      quoted = true;
    } else if (/\s/.test(ch)) {
      if (quoted || word !== "") out.push(word);
      word = "";
      quoted = false;
    } else word += ch;
  }
  if (quote !== null) throw new Error(`an unclosed quote in: cn ${line}`);
  if (quoted || word !== "") out.push(word);
  return out;
}

/**
 * One `cn` run against the throwaway, `line` being everything after `cn`, as an agent on
 * host `eval`; `as: "other"` is a second agent on another machine. Anything but exit 0
 * throws, since a seed that did not land makes every grade after it meaningless.
 */
function cn(line, { as } = {}) {
  const env = clean();
  env.CAIRN_URL = url;
  env.CAIRN_HOST = "eval";
  env.CAIRN_CAN = "web";
  env.XDG_CONFIG_HOME = xdg;
  env.CLAUDECODE = "1";
  if (as === "other") env.CAIRN_ACTOR = "mac/claude";
  const result = spawnSync(CN, words(line), { encoding: "utf8", cwd: xdg, env });
  if (result.status !== 0) {
    const out = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`;
    throw new Error(`cn ${line} exited ${result.status}:\n${out}`);
  }
  return result.stdout;
}

/**
 * The worklist every case reads: two P1s, one of them held by another session so the
 * brief shows it in progress and `cn ready` leaves it out, one issue needing a phone this
 * session does not have, and one plain P2. Each description says something the title
 * does not, which is what the what-it-is grader holds a reply to.
 */
function seed() {
  cn('project new app --name "the app"');
  cn('epic new "Connection handling"');
  cn(
    'create --project app --epic ep-1 --title "retry on reconnect" --priority 1 --description "The app drops its socket on a network change and never reconnects, so the person sees a spinner until they restart it."',
  );
  cn(
    'create --project app --epic ep-1 --title "offline banner on the login screen" --requires ios --description "The login screen gives no sign the device is offline, so a person on a train taps sign in and waits. The banner needs a phone to verify."',
  );
  cn(
    'create --project app --epic ep-1 --title "invite landing copy" --description "The invite landing page still reads as a placeholder: lorem ipsum under the logo and a button that says Button."',
  );
  cn(
    'create --project app --epic ep-1 --title "rotate the deployment secret" --priority 1 --description "The secret in 1Password is the one from the first setup and has been pasted into three machines; mint a new one and move each machine over."',
  );
  cn("claim app-4", { as: "other" });

  const ready = JSON.parse(cn("ready --json"));
  const ids = ready.map((issue) => issue.id);
  if (JSON.stringify(ids) !== JSON.stringify(["app-1", "app-2", "app-3"]))
    throw new Error(`the seed is not the worklist the cases expect: cn ready is ${ids}`);
  const needsIos = ready.find((issue) => issue.id === "app-2");
  if (JSON.stringify(needsIos.cannot) !== JSON.stringify(["ios"]))
    throw new Error(`app-2 should need ios here, and cannot is ${JSON.stringify(needsIos.cannot)}`);
}

/** The `cn` the eval child finds first on PATH, carrying the throwaway in its own body. */
function wrapper() {
  const path = join(bin, "cn");
  writeFileSync(
    path,
    [
      "#!/usr/bin/env bash",
      "# The eval child inherits only PATH: this is how the throwaway deployment reaches it.",
      `export CAIRN_URL='${url}'`,
      "export CAIRN_HOST=eval",
      "export CAIRN_CAN=web",
      `export XDG_CONFIG_HOME='${xdg}'`,
      "unset CAIRN_ACTOR CAIRN_SECRET",
      `exec '${CN}' "$@"`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
}

/** The cases `claude plugin eval` will find: every directory under evals/ with a prompt. */
function cases() {
  return readdirSync(EVALS, { withFileTypes: true }).filter(
    (entry) =>
      entry.isDirectory() &&
      entry.name !== "results" &&
      existsSync(join(EVALS, entry.name, "prompt.md")),
  ).length;
}

let deployment;
let status = 1;

const teardown = async () => {
  if (deployment) {
    const stopping = deployment;
    deployment = undefined;
    await stopping.stop();
  }
  for (const [dir, clear] of [
    [xdg, () => (xdg = undefined)],
    [bin, () => (bin = undefined)],
  ]) {
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
    clear();
  }
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void teardown().then(() => process.exit(1));
  });
}

try {
  deployment = await startThrowaway();
  url = deployment.url;
  xdg = mkdtempSync(join(tmpdir(), "cairn-evals-xdg-"));
  bin = mkdtempSync(join(tmpdir(), "cairn-evals-bin-"));
  seed();
  wrapper();
  const n = cases();
  if (n === 0) throw new Error(`no case under ${EVALS}: a directory holding a prompt.md`);

  // The whole suite, once each, with the plugin only: a no-plugin baseline arm would
  // grade a session that cannot reach cairn at all. Bash is the one gated tool a case
  // needs, since every read goes through `cn`.
  const env = clean();
  env.PATH = `${bin}:${process.env.PATH ?? ""}`;
  const result = spawnSync(
    "claude",
    [
      "plugin",
      "eval",
      PLUGIN,
      "--runs",
      "1",
      "--ablation",
      "none",
      "--allow-tools",
      "Bash",
      "--trust-plugin",
      "--no-publish",
    ],
    { cwd: root, stdio: "inherit", env },
  );
  if (result.error) throw result.error;
  status = result.status ?? 1;
  if (status === 0)
    console.log(
      `evals: ${n} ${n === 1 ? "case" : "cases"} passed against an empty throwaway deployment`,
    );
} catch (e) {
  console.error(`✗ ${e.message}`);
  status = 1;
} finally {
  try {
    await teardown();
  } catch (e) {
    console.error(`✗ ${e.message}`);
    status = 1;
  }
}

process.exit(status);
