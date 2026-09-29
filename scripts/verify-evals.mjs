// verify-evals.mjs: the plugin's eval suite, run for real against a worklist it seeds.
//
//   vp run verify:evals
//   node scripts/verify-evals.mjs --keep-temp     any argument goes on to `claude plugin eval`
//
// `claude plugin eval` starts each case as a fresh `claude -p` session with only the cairn
// plugin loaded, in a temporary HOME and cwd, and that child inherits only PATH,
// ANTHROPIC_*, CLAUDE_CODE_* and EVAL_* from this process. The case grants it Bash, and
// the eval docs say what that costs: "When you grant Bash in any form, every command runs
// under Claude Code's OS-level sandbox. Writes are confined to the run's workspace, your
// home directory and Claude Code configuration are unreadable, and network access is
// limited to domains you grant with --allow-tools WebFetch(domain:…)". Here node lives
// under the home directory and the throwaway listens on 127.0.0.1, so the real `cn` cannot
// run inside the child at all: no node, and no port to reach.
//
// So the child runs a stand-in. Each case that has a `bin/cn` gets, beside it, a
// `recorded/` directory of what the real `cn` printed against the throwaway moments
// before: stdout, stderr and exit status for every line in RECORDED, keyed by the line's
// arguments. The case's case.yaml lists `bin` under `context.add_dirs`, which is how the
// sandbox lets the child read it, and this puts that directory first on PATH, so the
// plugin's own hooks read the same recordings. A line the child runs beyond the list
// exits 1 and says it was not recorded, rather than answering something invented.
//
// Every case sees the one worklist seeded below, from an empty deployment, so the ids a
// grader names are the ids that get minted: ep-1, then app-1 to app-4. The seed is
// asserted before anything is recorded, since a run that grades the wrong worklist still
// costs a run.
//
// Each run is a `claude -p` child on this account's credential, plus the judge calls of
// every llm grader, so this is run by hand when the evals or the skill's rules change,
// never by CI. It never touches the worklist or the local copy on 3210: the target is
// only ever the deployment this script started, and `cn` reads a config home it starts
// empty. Results land under plugins/cairn/evals/results/, which is gitignored; with
// `--keep-temp` each run's sandbox and trace are kept too, for when a grader's reason is
// not in the report.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startThrowaway } from "../backend/scripts/throwaway.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CN = join(root, "packages", "cli", "bin", "cn");
const PLUGIN = join(root, "plugins", "cairn");
const EVALS = join(PLUGIN, "evals");

/**
 * The lines the stand-in answers, in the order they are recorded. The first two are what
 * the plugin's SessionStart and Stop hooks run, and `doctor` what SessionStart runs when
 * the brief fails; the rest are the reads a session asked "What's next?" can make of the
 * seeded worklist.
 */
const RECORDED = [
  "brief",
  "brief --unjournaled",
  "doctor",
  "ready",
  "ready --json",
  "list",
  "list --json",
  "waiting",
  "log",
  "epic list",
  "project list",
  "show ep-1",
  "show ep-1 --json",
  ...["app-1", "app-2", "app-3", "app-4"].flatMap((id) => [
    `show ${id}`,
    `show ${id} --json`,
    `show ${id} --history`,
  ]),
];

/** The deployment under test and the empty config home cn reads. */
let url;
let xdg;

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
 * throws, since a seed that did not land makes every grade after it meaningless, unless
 * `tolerate` asks for the whole result back instead.
 */
function cn(line, { as, tolerate = false } = {}) {
  const env = clean();
  env.CAIRN_URL = url;
  env.CAIRN_HOST = "eval";
  env.XDG_CONFIG_HOME = xdg;
  env.CLAUDECODE = "1";
  if (as === "other") env.CAIRN_ACTOR = "mac/claude";
  const result = spawnSync(CN, words(line), { encoding: "utf8", cwd: xdg, env });
  const stdout = result.stdout ?? "";
  const stderr = `${result.stderr ?? ""}${result.error?.message ?? ""}`;
  if (tolerate) return { stdout, stderr, status: result.status };
  if (result.status !== 0)
    throw new Error(`cn ${line} exited ${result.status}:\n${stdout}${stderr}`);
  return stdout;
}

/**
 * The worklist every case reads: two P1s, one of them held by another session so the
 * brief shows it in progress and `cn ready` leaves it out, one issue needing a phone this
 * session does not have, and one plain P2. Each description says something the title
 * does not, which is what the what-it-is grader holds a reply to.
 * The what-it-is grader of first-mention restates these four issues, one line each, so the
 * judge reads the reply alone; a change here changes that rubric in the same commit.
 */
function seed() {
  cn('project new app --name "the app"');
  cn('epic new "Connection handling"');
  cn(
    'create --project app --epic ep-1 --title "retry on reconnect" --priority 1 --description "The app drops its socket on a network change and never reconnects, so the person sees a spinner until they restart it."',
  );
  cn(
    'create --project app --epic ep-1 --title "offline banner on the login screen" --description "The login screen gives no sign the device is offline, so a person on a train taps sign in and waits. The banner needs a phone to verify."',
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
}

/**
 * What the real `cn` prints for every line in RECORDED, written beside the case's stand-in
 * as `<key>.out`, `<key>.err` and `<key>.status`. The key is the line's arguments joined
 * by spaces with every byte outside `A-Za-z0-9.-` made `_`, which is what the stand-in's
 * `tr` computes from its own `$*`. Every line has to exit 0 here: a recording of an error
 * is not the worklist the case expects.
 */
function record(caseDir) {
  const dir = join(caseDir, "bin", "recorded");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const line of RECORDED) {
    const { stdout, stderr, status } = cn(line, { tolerate: true });
    if (status !== 0)
      throw new Error(`cn ${line} exited ${status} while recording:\n${stdout}${stderr}`);
    const key = words(line)
      .join(" ")
      .replace(/[^A-Za-z0-9.-]/g, "_");
    writeFileSync(join(dir, `${key}.out`), stdout);
    writeFileSync(join(dir, `${key}.err`), stderr);
    writeFileSync(join(dir, `${key}.status`), String(status));
  }
}

/** The cases `claude plugin eval` will find: every directory under evals/ holding a prompt.md or a case.yaml, sorted. */
function cases() {
  return readdirSync(EVALS, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== "results" &&
        ["prompt.md", "case.yaml"].some((file) => existsSync(join(EVALS, entry.name, file))),
    )
    .map((entry) => join(EVALS, entry.name))
    .sort();
}

let deployment;
let status = 1;

const teardown = async () => {
  if (deployment) {
    const stopping = deployment;
    deployment = undefined;
    await stopping.stop();
  }
  if (xdg) {
    rmSync(xdg, { recursive: true, force: true });
    xdg = undefined;
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
  seed();
  const all = cases();
  const standIns = all.filter((dir) => existsSync(join(dir, "bin", "cn")));
  if (standIns.length === 0)
    throw new Error(
      `no case under ${EVALS} has a bin/cn: the child reaches the worklist only through a stand-in there`,
    );
  for (const dir of standIns) record(dir);
  const n = all.length;

  // The whole suite, once each, with the plugin only: a no-plugin baseline arm would
  // grade a session that cannot reach cairn at all. Bash is the one gated tool a case
  // needs, since every read goes through `cn`. One suite reads one worklist, so every
  // stand-in answers alike and the first one's directory is the one on PATH.
  const env = clean();
  env.PATH = `${join(standIns[0], "bin")}:${process.env.PATH ?? ""}`;
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
      ...process.argv.slice(2),
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
