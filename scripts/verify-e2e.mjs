// verify-e2e.mjs: the per-verb rows of AGENTS.md's verify table, run for real.
//
//   vp run verify:e2e
//
// The table says what to run when a verb changes; this is that list executed, in table
// order, with the real `cn` against a real deployment. A row's name here is the table's
// "Changed" cell, and packages/cli/src/contract.test.mts holds the two lists to each
// other, name for name and in order, so a row that exists in one and not the other fails
// `vp run verify` before anybody runs this.
//
// It runs from an empty deployment, which is what makes the ids the rows name the ids
// that get minted: the first epic is ep-1, the first issue cn-1, the first blocker bl-1.
// `backend/scripts/throwaway.mjs` starts that deployment on OS-chosen ports with its own
// state directory and deletes both afterwards. The target is only ever the deployment
// this script started — never the worklist, never the local dev copy on 3210 — and `cn`
// runs with XDG_CONFIG_HOME pointed at a temp directory, so ~/.config/cairn, config.json
// and secrets/ alike, cannot be read even if CAIRN_URL went missing. The `cn init` row is
// the one that writes a config at all, and it writes into a second temp directory it
// starts empty.
//
// A call is written the way it is typed: `cn("claim cn-2")`, with quotes holding a title
// together; `pass(line, why)` is the call that has to exit 0, and `json(line)` a read
// verb's --json parsed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OLD_FILE, pickClouds } from "../backend/scripts/clouds.mjs";
import { newCloud } from "../backend/scripts/new-cloud.mjs";
import { shipPage } from "../backend/scripts/page.mjs";
import { recordPush } from "../backend/scripts/pushed.mjs";
import { convexSync } from "../backend/scripts/run-convex.mjs";
import { changeSecret } from "../backend/scripts/secret.mjs";
import { startThrowaway } from "../backend/scripts/throwaway.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MAIN = join(root, "packages", "cli", "src", "main.mts");
const HOOK = join(root, "plugins", "cairn", "hooks", "session-start.sh");
const STOP = join(root, "plugins", "cairn", "hooks", "stop.sh");

/** The deployment under test and the config home cn reads, both set up in `main`. */
let url;
let home;
/** The config home the `cn init` row starts empty, and a directory holding a `cn` on PATH. */
let cold;
let bin;
/** A directory holding a stand-in `op`, for the secret rows, and the calls it logs. */
let opBin;
let opLog;
/** The last `cn` call, which is what a failed row prints beside its assertion. */
let last;
/**
 * What the secret rows set on the throwaway, each read by the rows after it. Never
 * printed: an assertion names a secret by its letter, never by its value.
 */
const secrets = {};

/** The environment every call gets: nothing of this machine's cairn, everything of this run's. */
function environment({ as, xdg, viaConfig, session, secret, deployment }) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("CAIRN_")) delete env[key];
  // A deployment named the way a repository's Claude settings name one, from the file.
  if (deployment !== undefined) env.CAIRN_DEPLOYMENT = deployment;
  // The secret rows fence the throwaway, and a call names the secret it carries.
  if (secret !== undefined) env.CAIRN_SECRET = secret;
  delete env.CLAUDECODE;
  delete env.CLAUDE_ENV_FILE;
  // A `viaConfig` call names no deployment in the environment, so the only place one can
  // come from is the file under XDG_CONFIG_HOME — which is what `cn init` writes.
  if (!viaConfig) env.CAIRN_URL = url;
  env.CAIRN_HOST = "e2e";
  env.XDG_CONFIG_HOME = xdg;
  if (as !== "human") env.CLAUDECODE = "1";
  if (as === "other") env.CAIRN_ACTOR = "other/agent";
  // What the SessionStart hook exports into a session: two shells of one name with two
  // of these are two sessions, and one with none is a shell the hook never ran in.
  if (session !== undefined) env.CAIRN_SESSION = session;
  return env;
}

/**
 * `line` split the way a shell splits a command: on whitespace, with a single- or
 * double-quoted span held together as one word and the quotes themselves dropped. A
 * newline inside quotes stays, so a description can span paragraphs.
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
 * One `cn` run, `line` being everything after `cn`. `as` is who the call is: an agent
 * (CLAUDECODE set, actor `e2e/claude`), a person (no CLAUDECODE), or a second agent on
 * another machine (CAIRN_ACTOR set). `session` is the Claude Code session it runs in,
 * when it runs in one. `xdg` is the config home it reads, and `viaConfig` withholds
 * CAIRN_URL so it has to. `input` is what it reads on stdin, which is empty without it.
 * `secret` is the CAIRN_SECRET it carries, once the secret rows have fenced the throwaway.
 * `deployment` is the CAIRN_DEPLOYMENT it carries, naming one deployment in the file.
 */
function cn(
  line,
  { as = "agent", xdg = home, viaConfig = false, session, input, secret, deployment } = {},
) {
  const env = environment({ as, xdg, viaConfig, session, secret, deployment });
  const result = spawnSync(process.execPath, [MAIN, ...words(line)], {
    encoding: "utf8",
    cwd: xdg,
    env,
    input,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  last = { line, status: result.status, stdout, stderr, out: stdout + stderr };
  return last;
}

/** A `cn` run that has to exit 0, `why` being what it means when it does not. */
function pass(line, why, opts) {
  const result = cn(line, opts);
  assert.equal(result.status, 0, why);
  return result;
}

/** A read verb's `--json`, parsed. Anything but exit 0 is the row failing. */
const json = (line, opts) =>
  JSON.parse(pass(`${line} --json`, `cn ${line} --json exited non-zero`, opts).stdout);

/**
 * The SessionStart hook, run as a cold machine with `cn` on PATH and no deployment, and
 * as Claude Code runs it: the session's JSON on stdin, and CLAUDE_ENV_FILE naming the
 * file it sources before every Bash command of that session. `deployment` is the
 * CAIRN_DEPLOYMENT a repository's Claude settings hand it.
 */
function hook({ session, envFile, xdg = cold, deployment } = {}) {
  const env = environment({ as: "agent", xdg, viaConfig: true, deployment });
  env.PATH = `${bin}:${env.PATH ?? ""}`;
  if (envFile !== undefined) env.CLAUDE_ENV_FILE = envFile;
  const input =
    session === undefined
      ? ""
      : JSON.stringify({ session_id: session, hook_event_name: "SessionStart", source: "startup" });
  const result = spawnSync("bash", [HOOK], { encoding: "utf8", cwd: cold, env, input });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  last = { line: "(hook)", status: result.status, stdout, stderr, out: stdout + stderr };
  return last;
}

/**
 * The Stop hook, run as Claude Code runs it: the stop's JSON on stdin, `cn` on PATH, and
 * the deployment under test in the environment. `path` puts another directory ahead of
 * the real `cn`, for the one assertion that needs a `cn` answering a line the deployment
 * will not mark for another hour.
 */
function stopHook(input, { path } = {}) {
  const env = environment({ as: "agent", xdg: home });
  env.PATH = [path, bin, env.PATH ?? ""].filter((p) => p !== undefined).join(":");
  const result = spawnSync("bash", [STOP], { encoding: "utf8", cwd: home, env, input });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  last = { line: "(stop hook)", status: result.status, stdout, stderr, out: stdout + stderr };
  return last;
}

/**
 * `backend/scripts/secret.mjs` against the throwaway: what `#secret` runs against the cloud,
 * with its lines collected rather than printed. `env` is the throwaway's own unless a row
 * puts the stand-in `op` on PATH.
 */
function secretRun(action, { op, env } = {}) {
  last = undefined;
  const got = { status: undefined, out: [], err: [] };
  got.status = changeSecret(action, {
    op,
    url,
    name: "e2e",
    deployment: "the throwaway",
    cwd: deployment.dir,
    env: env ?? deployment.env,
    out: (secret) => got.out.push(secret),
    err: (line) => got.err.push(line),
  });
  return got;
}

/**
 * The throwaway's environment with the stand-in `op` first on PATH. `items` is what its
 * `item list` prints and `item` what its `item get` does; `exit` and `error` make every
 * call of it fail with that line.
 */
const withOp = ({ items = "[]", item = "{}", exit, error } = {}) => ({
  ...deployment.env,
  PATH: `${opBin}:${deployment.env.PATH ?? ""}`,
  OP_STUB_LOG: opLog,
  OP_STUB_ITEMS: items,
  OP_STUB_ITEM: item,
  ...(exit === undefined ? {} : { OP_STUB_EXIT: String(exit) }),
  ...(error === undefined ? {} : { OP_STUB_ERR: error }),
});

/** Every call the stand-in `op` took since the log was last emptied: `{ args, stdin }`. */
const opCalls = () =>
  existsSync(opLog) ? lines(readFileSync(opLog, "utf8")).map((l) => JSON.parse(l)) : [];

/** The item a stand-in `op` call was handed on stdin, parsed. */
const itemIn = (call) => JSON.parse(call.stdin);

/** The secret a stand-in `op` call stored, read off the `secret` field of the item it took. */
const storedIn = (call) => {
  const field = (itemIn(call).fields ?? []).find((f) => f.label === "secret");
  assert.ok(field, "the op call stores no secret field");
  return field.value;
};

/** No call of the stand-in `op` carries `secret` in its argv, where a process list shows it. */
const offArgv = (calls, secret, what) =>
  assert.ok(
    calls.every(({ args }) => args.every((arg) => !arg.includes(secret))),
    `${what} put the secret in op's argv`,
  );

/** 32 random bytes as base64: what every secret the script sets has to be. */
const BASE64_32 = /^[A-Za-z0-9+/]{43}=$/;

/** No line in `said` carries `secret`: the script hands a secret out once and never echoes it. */
const unechoed = (said, secret, what) =>
  assert.ok(
    said.every((line) => !line.includes(secret)),
    `${what} printed the secret on stderr`,
  );

/** Revisions are read, never assumed: every write below carries what cn last printed. */
const revisionOf = (id) => json(`show ${id}`).revision;

const ids = (rows) => rows.map((r) => r.id);
/** Ids in a stable order, for a comparison where the order carries no meaning. */
const sorted = (list) => [...list].sort((a, b) => a.localeCompare(b));
const lines = (text) => text.split("\n").filter((l) => l.trim() !== "");

const rows = [];
const row = (name, fn) => rows.push({ name, fn });

// ---------------------------------------------------------------------------
// The rows, in the order AGENTS.md lists them. Each leaves the state the next reads.

row("verbs/doctor.mts", () => {
  const seen = pass("doctor", "cn doctor did not pass against the throwaway deployment");
  assert.match(seen.out, /deployment answered: 0 project\(s\)/);
  // Nothing has recorded a push on the throwaway, and a CAIRN_URL deployment is named by it.
  assert.equal(
    lines(seen.stdout).at(-1),
    `✓ functions on the deployment at ${url} not recorded: only #push:cloud records them`,
    "cn doctor's last line is not the functions line",
  );
  assert.match(seen.out, /^✓ actor e2e\/claude \(agent\), no session$/m, "no actor line");
  assert.doesNotMatch(seen.out, /^✓ can\b/m, "cn doctor still prints a can line");
  assert.match(
    cn("doctor", { session: "s-doc" }).out,
    /^✓ actor e2e\/claude \(agent\), session s-doc$/m,
    "the actor line does not carry the session",
  );

  const checks = json("doctor");
  assert.deepEqual(
    checks.map((c) => c.check),
    ["node", "api", "deployment", "actor", "ping", "functions"],
    "cn doctor --json is not the checks as rows",
  );
  assert.ok(
    checks.every((c) => c.ok === true && typeof c.line === "string"),
    `cn doctor --json has a failing check: ${JSON.stringify(checks)}`,
  );
});

row("verbs/project.mts", () => {
  pass(`project new cn --name 'cairn: backend, cli, plugin'`, "cn project new cn was refused");
  const listed = json("project list");
  assert.ok(
    listed.some((p) => p.slug === "cn"),
    "cn project list does not read the project back",
  );
  assert.ok(
    lines(pass("project list", "cn project list exited non-zero").stdout).includes(
      'cn "cairn: backend, cli, plugin"  nothing filed',
    ),
    "cn project list does not print the empty project's head as nothing filed",
  );
  const project = listed.find((p) => p.slug === "cn");
  assert.equal(project.filed, 0, "cn project list --json counts an issue under an empty project");
  assert.deepEqual(
    project.health,
    { moving: [], stuck: [], waiting: [] },
    "an empty project's health is not three empty lines",
  );
  assert.equal(project.pulse.length, 28, "the pulse does not cover 28 days");
  assert.ok(
    project.pulse.every((day) => day.events === 0 && day.closes === 0),
    `an empty project's pulse is not 28 quiet days: ${JSON.stringify(project.pulse)}`,
  );
});

row("verbs/epic.mts", () => {
  const made = pass(`epic new 'Create to close'`, "cn epic new was refused");
  assert.match(made.out, /ep-1/, "the first epic did not mint ep-1");
  const listed = pass("epic list", "cn epic list exited non-zero");
  assert.match(listed.out, /ep-1/);
  assert.match(listed.out, /Create to close/);
});

row("verbs/create.mts", () => {
  const missing = cn(
    "create --project cn --epic ep-1 --title 'scratch: nothing' --design @missing.md",
  );
  assert.equal(missing.status, 2, "a --design naming a missing file was not a usage error");
  assert.match(
    missing.out,
    /--design @missing\.md: cannot read missing\.md/,
    "the refusal does not name the missing file",
  );
  assert.deepEqual(json("list"), [], "a create refused for a missing file minted an issue");

  // `cn` runs in the config home, so a relative `@notes.md` is read from there.
  const design = "scratch: design from a file\n\n- one\n- two\n";
  writeFileSync(join(home, "notes.md"), design);
  const first = pass(
    `create --project cn --epic ep-1 --title 'scratch: first' --description "scratch: the first line\n\nand a second paragraph" --design @notes.md`,
    "cn create was refused",
  );
  assert.match(first.out, /cn-1/, "the first issue did not mint cn-1");
  assert.equal(json("show cn-1").design, design, "--design @notes.md did not store the file");
  assert.ok(!("requires" in json("show cn-1")), "cn show --json still carries requires");
  const requires = cn(`create --project cn --epic ep-1 --title 'scratch: ios' --requires ios`);
  assert.equal(requires.status, 2, "cn create --requires was not refused");
  assert.match(requires.stderr, /unknown option --requires/, "the refusal does not name it");
  assert.deepEqual(ids(json("list")), ["cn-1"], "a create refused for --requires minted one");
  const ftp = cn(
    `create --project cn --epic ep-1 --title 'scratch: ftp' --link ftp://example.com/x`,
  );
  assert.equal(ftp.status, 1, "a create with an ftp link was not refused");
  assert.match(ftp.out, /ftp:\/\/example\.com\/x/, "the refusal does not name the link");
  assert.deepEqual(ids(json("list")), ["cn-1"], "a create refused for its link minted an issue");
  const second = pass(
    `create --project cn --epic ep-1 --title 'scratch: second' --link https://example.com/created`,
    "the second cn create was refused",
  );
  assert.match(second.out, /cn-2/, "the second issue did not mint cn-2");
  assert.deepEqual(
    json("show cn-2").links.map((l) => l.url),
    ["https://example.com/created"],
    "cn create --link did not put the link on the issue",
  );
  const orphan = cn(`create --project cn --title 'scratch: no epic'`);
  assert.equal(orphan.status, 1, "a create with no --epic was not refused");
  assert.match(orphan.out, /ep-1/, "the refusal does not list the open epics");
});

row("verbs/list.mts", () => {
  const listed = json("list --epic ep-1");
  assert.deepEqual(ids(listed), ["cn-1", "cn-2"], "cn list is not priority then age");
  for (const issue of listed) assert.equal(typeof issue.title, "string", "--json has no title");

  const silent = lines(pass("list --silent 0d", "cn list --silent 0d was refused").stdout);
  assert.equal(silent.length, 2, "a zero duration did not list every live issue");
  for (const line of silent)
    assert.ok(line.endsWith(" · silent just now"), `not marked silent: ${line}`);
  for (const issue of json("list --silent 0d"))
    assert.equal(typeof issue.silentSince, "number", "--json has no silentSince");

  const day = cn("list --silent 1d");
  assert.equal(day.status, 0, "cn list --silent 1d did not exit 0");
  assert.equal(day.stdout, "", "an issue made just now is silent for a day");
  const blocked = cn("list --blocked");
  assert.equal(blocked.status, 0, "cn list --blocked did not exit 0");
  assert.equal(blocked.stdout, "", "cn list --blocked listed an issue with no edge into it");
  assert.equal(cn("list --silent 3x").status, 2, "a duration without a unit was not refused");
});

row("verbs/ready.mts", () => {
  // Work only a phone can do says so in its title, and lists like any other (cn-116).
  const made = pass(
    `create --project cn --epic ep-1 --title 'scratch: on a phone'`,
    "cn create of the third issue was refused",
  );
  assert.match(made.out, /cn-3/, "the third issue did not mint cn-3");

  const all = pass("ready", "cn ready exited non-zero");
  for (const id of ["cn-1", "cn-2", "cn-3"]) assert.match(all.out, new RegExp(id));
  assert.doesNotMatch(all.out, /· needs /, "cn ready still marks a row with what it needs");

  const can = cn("ready --can web");
  assert.equal(can.status, 2, "cn ready --can web was not refused");
  assert.match(can.stderr, /unknown option --can/, "the refusal does not name --can");

  // A positional is a flag the caller forgot to name, and it is refused, not run past.
  const stray = cn("ready ios");
  assert.equal(stray.status, 2, "cn ready ios ran past a positional instead of refusing it");
  assert.match(stray.stderr, /got "ios"/, "the refusal does not name the positional");
  assert.equal(stray.stdout, "", "cn ready ios printed an answer beside the refusal");
});

row("verbs/brief.mts", () => {
  const brief = pass("brief", "cn brief exited non-zero");
  assert.ok(lines(brief.stdout).length < 20, "cn brief is 20 lines or more");
  assert.match(lines(brief.stdout)[0], /^cairn · \S+ · \S+$/, "the brief's head carries more");
  assert.equal(
    lines(brief.stdout)[1],
    "projects        cn",
    "the brief's second line is not every project by slug",
  );
  assert.deepEqual(json("brief").projects, ["cn"], "cn brief --json does not carry projects");
  assert.equal(cn("brief --can web").status, 2, "cn brief --can web was not refused");
});

row("verbs/show.mts", () => {
  const issue = pass("show cn-1", "cn show cn-1 exited non-zero");
  assert.match(issue.out, /scratch: first/);
  assert.match(
    issue.out,
    /^status {10}open · P2 · created .* · revision 0$/m,
    "the status line does not open with the state",
  );
  assert.match(
    issue.out,
    /^description {5}scratch: the first line…$/m,
    "the brief does not print the description's first line, marked as cut",
  );
  const epic = pass("show ep-1", "cn show ep-1 exited non-zero");
  assert.match(epic.out, /cn-1/, "an epic does not show its open issues");
  pass("show cn-1 --history", "cn show --history exited non-zero");
});

row("verbs/claim.mts, verbs/release.mts", () => {
  const mine = pass("claim cn-2", "cn claim cn-2 was refused");
  assert.match(mine.out, /in_progress/);
  const theirs = cn("claim cn-2", { as: "other" });
  assert.equal(theirs.status, 1, "a second actor's claim was not refused");
  assert.match(theirs.out, /e2e\/claude/, "the refusal does not name who holds it");
  // Another agent may release a claim it does not hold: guidance keeps it off, not a refusal.
  const freed = cn("release cn-2", { as: "other" });
  assert.equal(freed.status, 0, "another agent's release of e2e/claude's claim was refused");
  assert.match(freed.out, /\bopen\b/, "another agent's release did not hand the issue back");
  pass("claim cn-2", "cn claim after a release was refused");

  // Two shells of one name in two sessions are two claimants; the same session claims once.
  pass("release cn-2", "cn release before the session round was refused");
  pass("claim cn-2", "a claim from a session was refused", { session: "s-1" });
  const second = cn("claim cn-2", { session: "s-2" });
  assert.equal(second.status, 1, "a second session of the same name was not refused");
  assert.match(
    second.out,
    /e2e\/claude in another session/,
    "the refusal does not say it is another session",
  );
  assert.equal(cn("claim cn-2").status, 1, "a shell with no session took a session's claim");
  const again = pass("claim cn-2", "the same session claiming again was refused", {
    session: "s-1",
  });
  assert.match(again.out, /r\d+$/m, "the idempotent claim did not print the issue line");
  const brief = json("brief", { session: "s-1" });
  const held = brief.inProgress.find((i) => i.id === "cn-2");
  assert.ok(held?.mine === true, "cn brief does not mark the claim as this session's");
  assert.ok(
    json("brief", { session: "s-2" }).inProgress.find((i) => i.id === "cn-2")?.mine === false,
    "cn brief marks another session's claim as this one's",
  );
  assert.match(
    cn("brief", { session: "s-1" }).out,
    /cn-2 "[^"]*" e2e\/claude [^·]*· yours/,
    "the brief line does not read `· yours`",
  );
  pass("release cn-2", "the session could not release its own claim", { session: "s-1" });
  pass("claim cn-2", "cn claim after the session round was refused");
});

row("verbs/update.mts", () => {
  const revision = revisionOf("cn-2");
  const line = `update cn-2 --revision ${revision} --priority 1`;
  pass(line, "cn update against the revision cn printed was refused");
  const current = revisionOf("cn-2");
  assert.notEqual(current, revision, "the update did not move the revision");
  const stale = cn(line);
  assert.equal(stale.status, 1, "a write against a moved revision was not refused");
  assert.match(
    stale.out,
    new RegExp(`^✗ cn-2 is at revision ${current}, you read ${revision}$`, "m"),
    "the refusal does not name the revision it is at and the one read",
  );
  assert.match(
    stale.out,
    /^ {2}r\d+ {2}e2e\/claude {2}just now {2}issue\.update {2}priority \d → 1$/m,
    "the refusal does not list the update that moved it",
  );
  assert.equal(
    lines(stale.out).at(-1),
    `  re-read with cn show cn-2 and retry with --revision ${current}`,
    "the refusal does not end with the real cn show and --revision to retry with",
  );

  // Links are a field like any other: added, relabelled and taken off against the revision.
  pass(
    `update cn-2 --revision ${current} --link '[doc](https://example.com/d)' --link https://example.com/b`,
    "cn update --link was refused",
  );
  const linked = cn("show cn-2").out.split("\n");
  const at = linked.findIndex((l) => l.startsWith("links "));
  assert.deepEqual(
    linked.slice(at, at + 3),
    [
      "links           https://example.com/created · by e2e/claude just now",
      "                doc · https://example.com/d · by e2e/claude just now",
      "                https://example.com/b · by e2e/claude just now",
    ],
    "cn show does not print the links block, created first, then doc, then b",
  );
  const carried = json("show cn-2").links;
  assert.deepEqual(
    carried.map((l) => [l.url, l.label, l.by.name]),
    [
      ["https://example.com/created", undefined, "e2e/claude"],
      ["https://example.com/d", "doc", "e2e/claude"],
      ["https://example.com/b", undefined, "e2e/claude"],
    ],
    "cn show --json does not carry the three links with who added them",
  );

  pass(
    `update cn-2 --revision ${revisionOf("cn-2")} --link '[the doc](https://example.com/d)'`,
    "relabelling a link was refused",
  );
  pass(
    `update cn-2 --revision ${revisionOf("cn-2")} --unlink https://example.com/b`,
    "cn update --unlink was refused",
  );
  assert.deepEqual(
    json("show cn-2").links.map((l) => [l.url, l.label]),
    [
      ["https://example.com/created", undefined],
      ["https://example.com/d", "the doc"],
    ],
    "the relabel and the unlink did not land",
  );

  const settled = revisionOf("cn-2");
  pass(
    `update cn-2 --revision ${settled} --link https://example.com/created`,
    "linking a URL the issue already carries was refused",
  );
  assert.equal(revisionOf("cn-2"), settled, "a link that changed nothing moved the revision");

  const missing = cn(`update cn-2 --revision ${settled} --unlink https://example.com/missing`);
  assert.equal(missing.status, 1, "unlinking a URL the issue does not carry was not refused");
  assert.match(missing.out, /https:\/\/example\.com\/missing/, "the refusal does not name the URL");
  const script = cn(`update cn-2 --revision ${settled} --link 'javascript:alert(1)'`);
  assert.equal(script.status, 1, "a javascript: link was not refused");
  assert.match(script.out, /javascript:alert\(1\)/, "the refusal does not name the link");
});

row("verbs/journal.mts", () => {
  const body = "scratch: a finding";
  pass(`journal cn-2 --kind finding '${body}'`, "cn journal was refused");
  assert.equal(json("show cn-2").journal[0].body, body, "the entry is not shown newest first");

  pass("journal cn-2 --kind finding @-", "cn journal @- was refused", { input: "line1\nline2" });
  assert.equal(
    json("show cn-2").journal[0].body,
    "line1\nline2",
    "the body read from stdin did not land whole",
  );
  const empty = cn("journal cn-2 --kind finding @-");
  assert.equal(empty.status, 2, "an empty stdin was not a usage error");
  assert.match(empty.out, /the body is missing/, "an empty stdin was not refused as no body");
});

row("verbs/search.mts", () => {
  /** The one line a search printed, held to how it starts and the field it ends on. */
  const one = (text, start, field) => {
    const found = lines(pass(`search ${text}`, `cn search ${text} was refused`).stdout);
    assert.equal(found.length, 1, `cn search ${text} did not print exactly one line`);
    assert.ok(found[0].startsWith(start), `cn search ${text} does not lead with ${start}`);
    assert.ok(found[0].endsWith(` · in ${field}`), `cn search ${text} is not marked in ${field}`);
  };
  one("first", 'cn-1 "scratch: first" P2 open', "title");
  one("paragraph", 'cn-1 "scratch: first"', "description");
  one("FINDING", 'cn-2 "scratch: second" P1 in_progress', "journal");
  one("example.com/d", 'cn-2 "scratch: second" P1 in_progress', "links");
  assert.deepEqual(
    json("search example.com/d").map((h) => [h.id, h.matched]),
    [["cn-2", "links"]],
    "cn search --json does not carry matched links",
  );

  const all = json("search scratch");
  assert.deepEqual(ids(all), ["cn-2", "cn-1", "cn-3"], "the hits are not in priority then age");
  assert.ok(
    all.every((h) => h.matched === "title"),
    "cn search --json does not carry matched",
  );
  assert.deepEqual(
    ids(json("search scratch --status open")),
    ["cn-1", "cn-3"],
    "--status open did not leave the claimed cn-2 out",
  );
  assert.equal(json("search scratch --project cn").length, 3, "--project cn lost a hit");

  const none = cn("search nothing-like-this");
  assert.equal(none.status, 0, "a search nothing holds did not exit 0");
  assert.equal(none.stdout, "", "a search nothing holds printed something");
  assert.equal(cn("search").status, 2, "cn search with no text was not a usage error");
});

row("verbs/dep.mts", () => {
  pass("dep add cn-2 --blocked-by cn-1", "cn dep add refused");
  assert.deepEqual(ids(json("show cn-2").blockedBy), ["cn-1"], "cn-2 is not blocked by cn-1");
  assert.deepEqual(ids(json("show cn-1").blocks), ["cn-2"], "cn-1 does not block cn-2");
  assert.ok(!ids(json("ready")).includes("cn-2"), "a blocked issue is still ready");
  const held = lines(pass("list --blocked", "cn list --blocked refused").stdout);
  assert.equal(held.length, 1, `cn list --blocked is not exactly cn-2: ${held.join(" | ")}`);
  assert.match(held[0], /^cn-2 "scratch: second" .* · blocked by cn-1 "scratch: first"$/);
  pass("dep rm cn-2 --blocked-by cn-1", "cn dep rm refused");
  assert.deepEqual(ids(json("show cn-2").blockedBy), [], "the edge survived cn dep rm");
  const freed = cn("list --blocked");
  assert.equal(freed.status, 0, "cn list --blocked after the rm did not exit 0");
  assert.equal(freed.stdout, "", "cn list --blocked still lists cn-2 after the rm");
});

row("verbs/wait.mts", () => {
  const made = pass(
    `create --project cn --epic ep-0 --title 'scratch: blocker round trip'`,
    "cn create into the inbox was refused",
  );
  assert.match(made.out, /cn-4/, "the fourth issue did not mint cn-4");

  const raised = pass(
    `wait cn-4 --kind decision --owner balder --title scratch --resolves 'the round trip is done'`,
    "cn wait was refused",
  );
  assert.match(raised.out, /bl-1/, "the first blocker did not mint bl-1");
  assert.ok(!ids(json("ready")).includes("cn-4"), "a blocked issue did not leave cn ready");
  assert.ok(ids(json("list")).includes("cn-4"), "a blocked issue left cn list as well");
});

row("verbs/waiting.mts", () => {
  const waiting = pass("waiting", "cn waiting exited non-zero");
  const named = lines(waiting.stdout).filter((l) => /\bbl-\d+/.test(l));
  assert.deepEqual(named.length, 1, "cn waiting is not one line per unresolved blocker");
  assert.match(named[0], /bl-1/);
  assert.equal(json("waiting").length, 1, "cn waiting --json is not the one blocker");
  const shown = pass("show bl-1", "cn show bl-1 exited non-zero");
  assert.match(shown.out, /cn-4/, "a blocker does not show what it holds");
});

row("verbs/ack.mts, verbs/resolve.mts", () => {
  const ack = cn("ack bl-1");
  assert.equal(ack.status, 1, "an agent without the person's word was allowed to ack");
  assert.match(ack.stderr, /--said/, "the refused ack does not name --said");
  pass("ack bl-1", "a person's ack was refused", { as: "human" });
  const resolve = cn("resolve bl-1 --note done");
  assert.equal(resolve.status, 1, "an agent without the person's word was allowed to resolve");
  assert.match(resolve.stderr, /--said/, "the refused resolve does not name --said");
  pass(
    'resolve bl-1 --note done --said "the round trip is done, go ahead"',
    "an agent's resolve on the person's word was refused",
  );
  assert.match(
    cn("show bl-1").out,
    /^resolved {8}by e2e\/claude just now: done\non their word {3}"the round trip is done, go ahead"$/m,
    "cn show bl-1 does not quote the person's words under resolved",
  );
  assert.ok(ids(json("ready")).includes("cn-4"), "the freed issue did not come back to ready");
  assert.equal(cn("waiting").stdout, "", "cn waiting prints something with nothing waiting");
});

row("verbs/drop.mts", () => {
  const revision = revisionOf("cn-4");
  const silent = cn(`drop cn-4 --revision ${revision}`);
  assert.equal(silent.status, 2, "a drop with no --reason was not a usage error");
  pass(`drop cn-4 --revision ${revision} --reason scratch`, "cn drop --reason was refused");
  assert.equal(json("show cn-4").droppedReason, "scratch", "the reason was not recorded");
  const shown = cn("show cn-4");
  assert.match(shown.out, /^status {10}dropped just now · /m, "cn show does not read the drop");
  assert.match(shown.out, /^reason {10}scratch$/m, "cn show does not print the reason");
});

row("verbs/close.mts", () => {
  // cn-3 is held by two issues before either closes, so the close of the first says
  // nothing about it and the close of the second prints it as ready.
  pass("dep add cn-3 --blocked-by cn-1", "cn dep add cn-3 --blocked-by cn-1 refused");
  pass("dep add cn-3 --blocked-by cn-2", "cn dep add cn-3 --blocked-by cn-2 refused");
  assert.ok(!ids(json("ready")).includes("cn-3"), "cn-3 is ready while two issues hold it");

  const failed = cn(`close cn-1 --revision ${revisionOf("cn-1")} --run 'exit 3'`);
  assert.notEqual(failed.status, 0, "a close on a command that failed was allowed");
  assert.equal(json("show cn-1").status, "open", "the refused close closed the issue anyway");

  const second = pass(
    `close cn-2 --revision ${revisionOf("cn-2")} --run 'echo proof' --follow-up 'scratch: follow-up' --kind verify`,
    "cn close --run 'echo proof' was refused",
  );
  assert.doesNotMatch(
    second.stdout,
    /^ {2}ready /m,
    "closing one of the two issues holding cn-3 printed a ready line",
  );
  const shown = json("show cn-2");
  assert.equal(shown.status, "closed", "the issue is not closed");
  assert.equal(shown.verification.command, "echo proof", "the record is not the command that ran");
  assert.equal(shown.verification.exitCode, 0, "the record is not the real exit code");
  assert.match(shown.verification.output, /proof/, "the record does not carry what it wrote");
  assert.equal(shown.followUps.length, 1, "the follow-up does not exist beside the closed parent");
  assert.equal(shown.followUps[0].status, "open", "the new follow-up does not carry its status");
  const printed = cn("show cn-2");
  assert.match(printed.out, /^status {10}closed just now · /m, "cn show does not read the close");
  assert.match(
    printed.out,
    /^follow-ups {6}cn-\d+ "scratch: follow-up"$/m,
    "cn show does not print the open follow-up as live, with no word after it",
  );
  assert.match(
    printed.out,
    /^proof {11}echo proof \(exit 0\) by \S+ just now$/m,
    "cn show does not print the proof as its line",
  );

  // The last thing holding cn-3 closes, and the answer says so the way cn ready would.
  const freed = pass(
    `close cn-1 --revision ${revisionOf("cn-1")} --run 'echo proof'`,
    "the second cn close cn-1 was refused",
  );
  assert.ok(
    lines(freed.stdout).some((l) =>
      /^ {2}ready {6}cn-3 "scratch: on a phone" P2 open {2}ep-1 "Create to close" r\d+$/.test(l),
    ),
    "closing the last issue holding cn-3 did not print it as a ready line",
  );
  assert.equal(json("show cn-1").status, "closed", "the second close of cn-1 did not close it");

  // A blocking edge from a finished issue is history, not a hold: cn show marks the end
  // done, and cn ready lists the issue again (§7).
  const held = cn("show cn-3");
  assert.match(held.out, /^status {10}open · /m, "a finished blocker reads as blocking");
  assert.match(
    held.out,
    /^blocked by {6}cn-1 "scratch: first" done, cn-2 "scratch: second" done$/m,
    "the finished ends of the two edges are not both marked done",
  );
  assert.ok(ids(json("ready")).includes("cn-3"), "a finished blocker held cn-3 out of ready");
});

row("verbs/log.mts", () => {
  const seen = pass("log", "cn log was refused");
  for (const line of lines(seen.stdout))
    assert.match(line, /^((cn|ep|bl)-\d+ "|—)/, `cn log printed a line with no lead: ${line}`);

  const whole = lines(cn("log --limit 200").stdout);
  for (const line of whole)
    assert.ok(!line.includes("{"), `cn log printed raw JSON for an event: ${line}`);
  assert.ok(
    whole.some((l) =>
      l.endsWith("  journal.append  e2e/claude  just now  finding: scratch: a finding"),
    ),
    "the journal entry does not read as its kind and first line",
  );
  assert.ok(
    whole.some((l) =>
      /^cn-4 ".*  blocker\.raise  e2e\/claude  just now  bl-1 "scratch" decision · owner balder$/.test(
        l,
      ),
    ),
    "the raise on cn-4 does not read as the blocker's line",
  );
  assert.ok(
    whole.some((l) =>
      /^cn-4 ".*  blocker\.resolve  e2e\/claude  just now  bl-1 "scratch": done, on their word "the round trip is done, go ahead"$/.test(
        l,
      ),
    ),
    "the resolve that freed cn-4 does not read as the blocker, the note and the person's words",
  );
  assert.ok(
    whole.some((l) =>
      /^bl-1 "scratch"  blocker\.resolve  e2e\/claude  just now  resolution — → done, status waiting → resolved, on their word "the round trip is done, go ahead"$/.test(
        l,
      ),
    ),
    "the blocker's own resolve does not read as a field map ending with the person's words",
  );
  for (const pieces of [
    "linked doc · https://example.com/d, linked https://example.com/b",
    "relabelled doc → the doc · https://example.com/d",
    "unlinked https://example.com/b",
  ])
    assert.ok(
      whole.some(
        (l) =>
          l.startsWith('cn-2 "scratch: second"  issue.update  ') &&
          l.endsWith(`  just now  ${pieces}`),
      ),
      `the links change on cn-2 does not read as ${pieces}`,
    );
  assert.ok(
    whole.some((l) =>
      l.endsWith('  project.create  e2e/claude  just now  cn "cairn: backend, cli, plugin"'),
    ),
    "the project's create does not read as its slug and name",
  );
  const added = whole.filter((l) => / {2}edge\.add {2}.* {2}blocked by cn-1$/.test(l));
  assert.equal(
    added.length,
    2,
    `the edges blocked by cn-1 are listed ${added.length} times, not twice`,
  );
  assert.deepEqual(
    added.map((l) => l.split(" ")[0]),
    ["cn-3", "cn-2"],
    "each edge is not listed once, newest first, on the end that leads its sentence",
  );

  const capped = pass("log --limit 3", "cn log --limit 3 was refused");
  assert.equal(lines(capped.stdout).length, 3, "cn log --limit 3 did not print exactly 3 lines");

  const all = json("log --limit 200");
  for (let i = 1; i < all.length; i++)
    assert.ok(all[i - 1].at >= all[i].at, "cn log --json is not newest first");
  for (const e of all)
    for (const named of [e.issue, e.epic, e.blocker])
      if (named !== undefined)
        assert.ok(
          typeof named.id === "string" && typeof named.title === "string",
          "an event names something without carrying both its id and its title",
        );
  const closed = all.find((e) => e.kind === "issue.close" && e.issue?.id === "cn-2");
  assert.equal(
    closed?.changes?.verification?.to,
    "echo proof (exit 0)",
    "cn log does not carry the verification cn-2 was closed with",
  );

  assert.equal(cn("log --limit 0").status, 2, "cn log --limit 0 was not a usage error");
});

row("verbs/epic.mts (close)", () => {
  const refused = cn(`epic close ep-1 --revision ${revisionOf("ep-1")}`);
  assert.equal(refused.status, 1, "an epic with open work was allowed to close");
  assert.match(refused.out, /cn-3/, "the refusal does not name cn-3, still open");
});

/** The two near-identical issues the create row mints in ep-2, read by the two rows after it. */
let twin;
let other;

row("verbs/create.mts (near)", () => {
  const made = pass(`epic new 'scratch: review'`, "cn epic new was refused");
  assert.match(made.out, /ep-2/, "the second epic did not mint ep-2");
  const first = pass(
    `create --project cn --epic ep-2 --title 'scratch: the same title'`,
    "cn create of the first twin was refused",
  );
  assert.doesNotMatch(first.stdout, /^ {2}near /m, "the first of its title printed a near line");
  const second = pass(
    `create --project cn --epic ep-2 --title 'scratch: the same title.'`,
    "cn create of a near-identical title was refused",
  );
  assert.match(
    second.stdout,
    /^ {2}near {7}cn-\d+ "scratch: the same title"$/m,
    "the near-identical create does not hand back the first twin on a near line",
  );
  [twin, other] = ids(json("list --epic ep-2"));
  assert.ok(twin && other, "cn list --epic ep-2 does not read back both twins");
});

row("verbs/review.mts", () => {
  const head = 'ep-2 "scratch: review"  0 done · 2 open · 0 follow-ups';
  const seen = pass("review ep-2", "cn review ep-2 was refused");
  assert.deepEqual(
    lines(seen.stdout),
    [
      head,
      `  near        ${twin} "scratch: the same title" and ${other} "scratch: the same title."`,
    ],
    "cn review does not read as the epic's counts and the one near pair",
  );
  const view = json("review ep-2");
  assert.equal(view.near.length, 1, "cn review --json does not carry exactly one near pair");
  assert.equal(view.canClose, false, "cn review --json offers to close an epic with open work");
  assert.deepEqual(
    [view.near[0].a.id, view.near[0].b.id],
    [twin, other],
    "the near pair is not the two twins in order",
  );

  const before = json("log --limit 200").length;
  pass("review ep-2", "a second cn review was refused");
  pass("review ep-2", "a third cn review was refused");
  assert.equal(json("log --limit 200").length, before, "cn review wrote an event");

  assert.equal(cn("review cn-1").status, 2, "cn review on an issue id was not a usage error");

  pass(`dep add ${other} --duplicates ${twin}`, "cn dep add --duplicates was refused");
  assert.deepEqual(
    lines(cn("review ep-2").stdout),
    [head, "  nothing to look at"],
    "a pair with a duplicates edge between them is still listed",
  );
});

row("verbs/close.mts (offer)", () => {
  const first = pass(
    `close ${twin} --revision ${revisionOf(twin)} --run 'echo proof'`,
    `cn close ${twin} --run 'echo proof' was refused`,
  );
  assert.doesNotMatch(first.stdout, /^ {2}epic /m, "the epic was offered with a twin still open");

  const second = pass(
    `close ${other} --revision ${revisionOf(other)} --unverified 'scratch: no device here'`,
    `cn close ${other} --unverified was refused`,
  );
  assert.match(
    second.stdout,
    /^ {2}follow-up {2}cn-\d+ "verify: scratch: the same title\."/m,
    "an unverified close with no --follow-up did not spawn a verify follow-up",
  );
  assert.doesNotMatch(second.stdout, /^ {2}epic /m, "the epic was offered with a follow-up open");
  const followUps = json(`show ${other}`).followUps;
  assert.equal(followUps.length, 1, "the spawned follow-up does not sit beside the closed parent");
  const spawned = followUps[0].id;

  // An edge from the closed twin into the open follow-up: one end finished and one live, so
  // the review lists it.
  pass(
    `dep add ${spawned} --blocked-by ${twin}`,
    `cn dep add ${spawned} --blocked-by ${twin} refused`,
  );
  assert.deepEqual(
    lines(cn("review ep-2").stdout),
    [
      'ep-2 "scratch: review"  2 done · 0 open · 1 follow-up',
      `  edge        ${twin} "scratch: the same title" done blocks ${spawned} "verify: scratch: the same title."`,
    ],
    "cn review does not list a blocks edge with one end finished and one live",
  );

  const finishing = pass(
    `close ${spawned} --revision ${revisionOf(spawned)} --run 'echo proof'`,
    `cn close ${spawned} --run 'echo proof' was refused`,
  );
  const revision = revisionOf("ep-2");
  const offer = `cn epic close ep-2 --revision ${revision}`;
  assert.ok(
    lines(finishing.stdout).includes(`  epic       ep-2 "scratch: review" can close · ${offer}`),
    "the close of the epic's last issue does not print the cn epic close line",
  );
  // Every issue cn show names that is finished reads so: the follow-up from its parent, and
  // the parent and the edge's far end from the follow-up.
  assert.ok(
    lines(cn(`show ${other}`).stdout).includes(
      `follow-ups      ${spawned} "verify: scratch: the same title." done`,
    ),
    "cn show does not read a closed follow-up as done",
  );
  const shownSpawned = lines(cn(`show ${spawned}`).stdout);
  assert.ok(
    shownSpawned.includes(`parent          ${other} "scratch: the same title." done`),
    "cn show does not read a closed parent as done",
  );
  assert.ok(
    shownSpawned.includes(`blocked by      ${twin} "scratch: the same title" done`),
    "cn show does not read the finished end of a blocks edge as done",
  );
  assert.equal(
    json(`show ${other}`).followUps[0].status,
    "closed",
    "cn show --json does not carry a closed follow-up's status",
  );

  assert.deepEqual(
    lines(cn("review ep-2").stdout),
    ['ep-2 "scratch: review"  2 done · 0 open · 0 follow-ups', `  can close   ${offer}`],
    "cn review does not read a finished epic as the counts and the can close line",
  );
  assert.equal(json("review ep-2").canClose, true, "cn review --json does not say canClose");

  pass(
    `epic close ep-2 --revision ${revision}`,
    "the cn epic close line the offer printed was refused",
  );
  assert.equal(json("show ep-2").status, "closed", "ep-2 is not closed");
  const after = lines(cn("review ep-2").stdout);
  assert.equal(after[1], "  nothing to look at", "a closed epic still reviews to a finding");
  assert.equal(json("review ep-2").canClose, false, "a closed epic still says canClose");
});

row("verbs/update.mts (epic)", () => {
  const made = pass(
    `epic new 'scratch: plan' --link '[plan](https://example.com/plan)'`,
    "cn epic new --link was refused",
  );
  assert.match(made.out, /ep-3/, "the third epic did not mint ep-3");

  const shown = lines(pass("show ep-3", "cn show ep-3 exited non-zero").stdout);
  assert.equal(
    shown[0],
    'ep-3 "scratch: plan"  0 done · 0 open · 0 follow-ups · revision 0',
    "cn show ep-3 does not open with the epic's head and its revision",
  );
  assert.ok(
    shown.includes("links           plan · https://example.com/plan · by e2e/claude just now"),
    "cn show ep-3 does not print the link given at cn epic new",
  );
  assert.deepEqual(
    json("show ep-3").links.map((l) => [l.url, l.label, l.by.name]),
    [["https://example.com/plan", "plan", "e2e/claude"]],
    "cn show ep-3 --json does not carry the link with who added it",
  );

  const line = `update ep-3 --revision 0 --title 'scratch: the plan' --description 'scratch: why'`;
  const updated = pass(line, "cn update ep-3 against the revision cn printed was refused");
  assert.equal(
    updated.stdout.trim(),
    'ep-3 "scratch: the plan" r1',
    "cn update ep-3 does not print the epic and its new revision",
  );
  const stale = cn(line);
  assert.equal(stale.status, 1, "a write to an epic against a moved revision was not refused");
  assert.match(
    stale.out,
    /^✗ ep-3 is at revision 1, you read 0$/m,
    "the refusal does not name the revision the epic is at and the one read",
  );
  assert.match(
    stale.out,
    /^ {2}r1 {2}e2e\/claude {2}just now {2}epic\.update {2}/m,
    "the refusal does not list the epic.update that moved it",
  );
  assert.equal(
    lines(stale.out).at(-1),
    "  re-read with cn show ep-3 and retry with --revision 1",
    "the refusal does not end with the real cn show and --revision to retry with",
  );

  pass(
    "update ep-3 --revision 1 --link https://example.com/b",
    "cn update ep-3 --link was refused",
  );
  assert.match(
    pass("log --limit 1", "cn log --limit 1 exited non-zero").stdout,
    /^ep-3 "scratch: the plan" {2}epic\.update .*linked https:\/\/example\.com\/b/,
    "cn log does not read the epic's link edit as linked",
  );

  const priority = cn("update ep-3 --revision 2 --priority 1");
  assert.equal(priority.status, 2, "a flag an epic has no field for was not a usage error");
  assert.match(
    priority.out,
    /an epic has no --priority; cn update ep-3 takes --title, --description, --link and --unlink/,
    "the refusal does not name the flag and what an epic takes",
  );

  const closed = cn(`update ep-2 --revision ${revisionOf("ep-2")} --title scratch`);
  assert.equal(closed.status, 1, "a closed epic was allowed to change");
  assert.match(closed.out, /ep-2 is closed; nothing about it changes now/);
  const inbox = cn(`update ep-0 --revision ${revisionOf("ep-0")} --title scratch`);
  assert.equal(inbox.status, 1, "the inbox was allowed to change");
  assert.match(inbox.out, /ep-0 is the inbox; it does not change/);
});

row("verbs/update.mts (blocker)", () => {
  const made = pass(
    `create --project cn --epic ep-3 --title 'scratch: a decision'`,
    "cn create in ep-3 was refused",
  );
  const issue = made.stdout.match(/^(cn-\d+) /)?.[1];
  assert.ok(issue, "cn create did not print the new issue's id first");

  const raised = pass(
    `wait ${issue} --kind decision --owner balder --title 'scratch: options' --resolves 'scratch: one is picked' --link '[options](https://example.com/options)'`,
    "cn wait --link was refused",
  );
  assert.match(raised.out, /bl-2/, "the second blocker did not mint bl-2");

  const shown = lines(pass("show bl-2", "cn show bl-2 exited non-zero").stdout);
  assert.ok(
    shown.some((l) => /^status {10}.* · revision 0$/.test(l)),
    "cn show bl-2 does not end its status line with the revision",
  );
  assert.ok(
    shown.includes(
      "links           options · https://example.com/options · by e2e/claude just now",
    ),
    "cn show bl-2 does not print the link given at cn wait",
  );
  assert.deepEqual(
    json("show bl-2").links.map((l) => [l.url, l.label, l.by.name]),
    [["https://example.com/options", "options", "e2e/claude"]],
    "cn show bl-2 --json does not carry the link with who added it",
  );

  const line = `update bl-2 --revision 0 --title 'scratch: the options' --resolves 'scratch: one is chosen'`;
  const updated = pass(line, "cn update bl-2 against the revision cn printed was refused");
  assert.match(
    updated.stdout.trim(),
    /^bl-2 "scratch: the options" .* r1$/,
    "cn update bl-2 does not print the blocker's line and its new revision",
  );
  const stale = cn(line);
  assert.equal(stale.status, 1, "a write to a blocker against a moved revision was not refused");
  assert.match(stale.out, /^✗ bl-2 is at revision 1, you read 0$/m);
  assert.match(
    stale.out,
    /^ {2}r1 {2}e2e\/claude {2}just now {2}blocker\.update {2}/m,
    "the refusal does not list the blocker.update that moved it",
  );
  assert.equal(
    lines(stale.out).at(-1),
    "  re-read with cn show bl-2 and retry with --revision 1",
    "the refusal does not end with the real cn show and --revision to retry with",
  );

  pass(
    "update bl-2 --revision 1 --unlink https://example.com/options --link https://example.com/choice",
    "cn update bl-2 --unlink --link was refused",
  );
  const after = json("show bl-2");
  assert.deepEqual(
    after.links.map((l) => l.url),
    ["https://example.com/choice"],
    "the unlink and the link on bl-2 did not land",
  );
  assert.equal(after.whatResolves, "scratch: one is chosen", "--resolves did not land");

  const description = cn("update bl-2 --revision 2 --description x");
  assert.equal(description.status, 2, "a flag a blocker has no field for was not a usage error");
  assert.match(
    description.out,
    /a blocker has no --description; cn update bl-2 takes --title, --resolves, --link and --unlink/,
  );
  const owner = cn("update bl-2 --revision 2 --owner someone");
  assert.equal(owner.status, 2, "--owner on cn update was not a usage error");
  assert.match(owner.out, /--owner/, "the refusal does not name --owner");
  const attach = cn(`wait ${issue} --on bl-2 --link https://example.com/x`);
  assert.equal(attach.status, 2, "--link beside --on was not a usage error");
  assert.match(attach.out, /--link/, "the refusal does not name --link");
  const resolved = cn(`update bl-1 --revision ${revisionOf("bl-1")} --title scratch`);
  assert.equal(resolved.status, 1, "a resolved blocker was allowed to change");
  assert.match(resolved.out, /bl-1 was resolved by/);
});

row("verbs/project.mts (update)", () => {
  const made = pass(
    `project new scratch --name 'scratch: a project' --description 'scratch: what it holds' --link '[repo](https://example.com/repo)'`,
    "cn project new --description --link was refused",
  );
  assert.equal(
    made.stdout.trim(),
    "scratch  scratch: a project",
    "cn project new does not print the slug and the name",
  );
  const listed = json("project list").find((p) => p.slug === "scratch");
  assert.ok(listed, "cn project list --json does not carry the new project");
  assert.equal(listed.description, "scratch: what it holds", "the description did not land");
  assert.deepEqual(
    listed.links.map((l) => [l.url, l.label, l.by.name]),
    [["https://example.com/repo", "repo", "e2e/claude"]],
    "cn project list --json does not carry the link with who added it",
  );
  assert.equal(listed.revision, 0, "a new project is not at revision 0");
  assert.ok(
    lines(pass("project list", "cn project list exited non-zero").stdout).includes(
      'scratch "scratch: a project"  nothing filed',
    ),
    "cn project list does not print the new project's head as nothing filed",
  );

  const line = `project update scratch --revision 0 --name 'scratch: the project' --description 'scratch: why'`;
  const updated = pass(line, "cn project update against the revision it was at was refused");
  assert.equal(
    updated.stdout.trim(),
    'scratch "scratch: the project" r1',
    "cn project update does not print the project and its new revision",
  );
  const stale = cn(line);
  assert.equal(stale.status, 1, "a write to a project against a moved revision was not refused");
  assert.match(
    stale.stderr,
    /^ {2}r1 {2}e2e\/claude {2}just now {2}project\.update {2}/m,
    "the refusal does not list the project.update that moved it",
  );
  assert.equal(
    lines(stale.stderr).at(-1),
    "  re-read with cn project list --json and retry with --revision 1",
    "the refusal does not end with where a project's revision is read and --revision to retry with",
  );

  const relinked = pass(
    "project update scratch --revision 1 --link https://example.com/b --unlink https://example.com/repo",
    "cn project update --link --unlink was refused",
  );
  assert.match(relinked.stdout.trim(), / r2$/, "the link edit did not move the project to r2");
  const logged = lines(pass("log --limit 1", "cn log --limit 1 exited non-zero").stdout);
  assert.equal(logged.length, 1, "cn log --limit 1 printed other than one line");
  assert.ok(logged[0].startsWith("—  project.update"), "a project's update leads with something");
  for (const piece of [
    'scratch "scratch: the project": ',
    "linked https://example.com/b",
    "unlinked repo · https://example.com/repo",
  ])
    assert.ok(logged[0].includes(piece), `cn log's project.update line lacks ${piece}`);

  const slug = cn("project update scratch --revision 2 --slug other");
  assert.equal(slug.status, 2, "--slug on cn project update was not a usage error");
  const nothing = cn("project update scratch --revision 2");
  assert.equal(nothing.status, 2, "cn project update with nothing to change was not refused");
  const unknown = cn("project update nope --revision 0 --name x");
  assert.equal(unknown.status, 1, "an unknown slug was not refused");
  assert.match(unknown.out, /nope/, "the refusal does not name the slug");
});

row("plugins/cairn/hooks/stop.sh", () => {
  const stop = (session, extra = {}, opts = {}) =>
    stopHook(JSON.stringify({ session_id: session, hook_event_name: "Stop", ...extra }), opts);
  pass("claim cn-3", "cn claim cn-3 for the Stop hook was refused", { session: "s-stop" });

  // Held a moment ago: the deployment marks nothing quiet, so the hook says nothing.
  const fresh = stop("s-stop");
  assert.equal(fresh.status, 0, "the hook exited non-zero with a fresh claim held");
  assert.equal(fresh.stdout, "", "the hook printed something for a claim held a moment ago");
  assert.deepEqual(
    json("brief --unjournaled", { session: "s-stop" }),
    [],
    "cn brief --unjournaled --json names a claim held a moment ago",
  );
  const held = json("brief", { session: "s-stop" }).inProgress.find((i) => i.id === "cn-3");
  assert.ok(held?.mine === true && !("unjournaledSince" in held), "the brief marked it quiet");

  // Already continuing because of a stop hook, and a stop with no session: silent, exit 0.
  const active = stop("s-stop", { stop_hook_active: true });
  assert.equal(active.status, 0, "the hook exited non-zero under stop_hook_active");
  assert.equal(active.stdout, "", "the hook spoke under stop_hook_active");
  const nobody = stopHook("");
  assert.equal(nobody.status, 0, "the hook exited non-zero with empty stdin");
  assert.equal(nobody.stdout, "", "the hook spoke with no session");

  // The wrapping, with the line the deployment will mark an hour from now: a `cn` that
  // answers it stands in, so the JSON, its event name and the escaping of a title's quotes
  // and backslashes are proved without waiting for the threshold. The threshold crossing
  // itself is backend/convex/tests/brief.test.ts.
  const line = 'you hold cn-3 "scratch: a "quoted" \\ title", last journal 3h ago';
  const fake = mkdtempSync(join(tmpdir(), "cairn-e2e-fake-"));
  try {
    writeFileSync(join(fake, "cn"), `#!/usr/bin/env bash\ncat <<'LINE'\n${line}\nLINE\n`, {
      mode: 0o755,
    });
    const wrapped = stop("s-stop", {}, { path: fake });
    assert.equal(wrapped.status, 0, "the hook exited non-zero with a line to hand back");
    assert.equal(lines(wrapped.stdout).length, 1, "the hook printed more than one line");
    assert.deepEqual(
      JSON.parse(wrapped.stdout),
      { hookSpecificOutput: { hookEventName: "Stop", additionalContext: line } },
      "the hook did not wrap the line as Stop additionalContext",
    );
    const quiet = stop("s-stop", { stop_hook_active: true }, { path: fake });
    assert.equal(quiet.stdout, "", "the hook handed the line back twice in a row");
  } finally {
    rmSync(fake, { recursive: true, force: true });
  }
  pass("release cn-3", "release refused", { session: "s-stop" });
});

row("verbs/init.mts", () => {
  const config = join(cold, "cairn", "config.json");
  const viaFile = { xdg: cold, viaConfig: true };

  // A machine with nothing configured: every verb says so, and the hook says where to go.
  const blind = cn("doctor", viaFile);
  assert.equal(blind.status, 1, "cn doctor passed on a machine with no deployment at all");
  assert.match(blind.out, /cn init/, "the refusal does not name the verb that fixes it");
  const asked = hook();
  assert.equal(asked.status, 0, "the hook exited non-zero with nothing configured");
  assert.match(asked.stdout, /not set up/, "the hook does not say the machine is not set up");
  assert.match(asked.stdout, /\/cairn:init/, "the hook does not point at /cairn:init");

  // The whole setup, as a person would run it, with the secret coming from a command.
  const setup = `init --name e2e --url ${url} --secret-cmd 'echo s3cret'`;
  const made = pass(setup, "cn init was refused against a deployment that answers", viaFile);
  assert.ok(!made.out.includes("s3cret"), "cn init printed the secret it was given");
  assert.equal(statSync(config).mode & 0o777, 0o600, "the config is not mode 600");
  assert.deepEqual(JSON.parse(readFileSync(config, "utf8")), {
    default: "e2e",
    deployments: { e2e: { url, secretCmd: "echo s3cret" } },
  });
  const secretsDir = join(cold, "cairn", "secrets");
  assert.equal(
    readFileSync(join(secretsDir, "e2e"), "utf8"),
    "s3cret\n",
    "the secret was not kept",
  );
  assert.equal(statSync(join(secretsDir, "e2e")).mode & 0o777, 0o600, "the secret is not mode 600");
  assert.equal(statSync(secretsDir).mode & 0o777, 0o700, "secrets/ is not mode 700");

  // The file alone is enough from here: nothing in the environment names a deployment.
  const doctored = pass("doctor", "cn doctor failed on the config cn init just wrote", viaFile);
  assert.match(doctored.out, /e2e/, "cn doctor does not name the deployment it resolved");
  assert.match(doctored.out, /from default/, "cn doctor does not name the default as the source");
  assert.match(
    doctored.out,
    /from default, secret from secrets\/e2e/,
    "cn doctor does not name secrets/e2e as where the secret came from",
  );
  assert.match(
    doctored.out,
    /^✓ secret accepted by e2e$/m,
    "the secret the machine holds was not taken",
  );

  const written = readFileSync(config, "utf8");
  const again = cn(setup, viaFile);
  assert.equal(again.status, 1, "cn init replaced a deployment that was already there");
  assert.match(again.out, /already a deployment/, "the refusal does not say the name is taken");
  assert.equal(readFileSync(config, "utf8"), written, "the refused cn init wrote anyway");

  pass(`init --name other --url ${url}`, "a second deployment was refused", viaFile);
  const both = JSON.parse(readFileSync(config, "utf8"));
  assert.deepEqual(sorted(Object.keys(both.deployments)), ["e2e", "other"], "both are not there");
  assert.equal(both.default, "e2e", "a second deployment took the default without --default");
  assert.ok(!("secret" in both.deployments.other), "a deployment with no secret got a secret key");
  assert.ok(
    !("secretCmd" in both.deployments.other),
    "a deployment with no secret command got a secretCmd key",
  );
  assert.ok(
    !existsSync(join(secretsDir, "other")),
    "a deployment with no secret got a secret file",
  );

  const dead = cn("init --name dead --url http://127.0.0.1:9", viaFile);
  assert.equal(dead.status, 1, "cn init against a deployment that does not answer was allowed");
  assert.match(dead.out, /nothing written/, "the refusal does not say nothing was written");
  assert.ok(!readFileSync(config, "utf8").includes("dead"), "a failed check was written anyway");

  // The third state: a config that names a deployment which does not answer. `cn init`
  // refuses to write one, so the file is written here, the way a moved or retired
  // deployment leaves one behind.
  const gone = mkdtempSync(join(tmpdir(), "cairn-e2e-gone-"));
  mkdirSync(join(gone, "cairn"));
  writeFileSync(
    join(gone, "cairn", "config.json"),
    JSON.stringify({ default: "dead", deployments: { dead: { url: "http://127.0.0.1:9" } } }),
  );
  const started = Date.now();
  const unanswered = hook({ xdg: gone });
  const took = Date.now() - started;
  rmSync(gone, { recursive: true, force: true });
  assert.equal(
    unanswered.status,
    0,
    "the hook exited non-zero with a deployment that does not answer",
  );
  assert.equal(
    unanswered.stdout,
    "cairn: dead did not answer; cn doctor says why\n",
    "the hook does not say, in one line, which deployment did not answer and where the diagnosis is",
  );
  assert.ok(
    took < 5000,
    `the hook took ${took}ms against a dead URL, past the 5 s the plugin allows it`,
  );

  // The second acceptance criterion: the first session after setup opens with the brief.
  const warm = hook();
  assert.equal(warm.status, 0, "the hook exited non-zero with a deployment configured");
  assert.ok(!warm.stdout.includes("/cairn:init"), "the hook still asks for setup after cn init");
  assert.match(warm.stdout, /e2e/, "the brief does not name the deployment");

  // Run as Claude Code runs it, the hook hands the session on to every later Bash command.
  const envFile = join(cold, "claude-env");
  const inSession = hook({ session: "s-hook", envFile });
  assert.equal(inSession.status, 0, "the hook exited non-zero with a session on stdin");
  assert.equal(
    readFileSync(envFile, "utf8"),
    "export CAIRN_SESSION=s-hook\n",
    "the hook did not export the session id to CLAUDE_ENV_FILE",
  );
  hook({ session: "s-hook", envFile });
  assert.equal(
    readFileSync(envFile, "utf8"),
    "export CAIRN_SESSION=s-hook\nexport CAIRN_SESSION=s-hook\n",
    "the hook does not append to a file another hook may have written",
  );
  const ttyless = hook({ envFile });
  assert.equal(ttyless.status, 0, "the hook exited non-zero with empty stdin");
  assert.equal(readFileSync(envFile, "utf8").split("\n").length, 3, "empty stdin wrote a line");
});

row("lib/config.mts", () => {
  // A machine with two deployments, the default one dead, the way a machine that works
  // for two companies holds both: CAIRN_DEPLOYMENT is how a repository picks the other.
  // The throwaway has no secret set yet, so it takes the one secrets/e2e holds.
  const named = mkdtempSync(join(tmpdir(), "cairn-e2e-named-"));
  const empty = mkdtempSync(join(tmpdir(), "cairn-e2e-empty-"));
  const config = join(named, "cairn", "config.json");
  const secretFile = join(named, "cairn", "secrets", "e2e");
  const both = {
    default: "dead",
    deployments: {
      dead: { url: "http://127.0.0.1:9" },
      e2e: { url, secretCmd: "echo s3cret" },
    },
  };
  mkdirSync(join(named, "cairn", "secrets"), { recursive: true, mode: 0o700 });
  writeFileSync(config, JSON.stringify(both), { mode: 0o600 });
  writeFileSync(secretFile, "s3cret\n", { mode: 0o600 });
  const viaFile = { xdg: named, viaConfig: true };
  const missing =
    "CAIRN_DEPLOYMENT is nope, and this machine has no deployment by that name (it has dead, e2e): cn init --name nope sets it up (cn init --help)";
  const unset =
    "CAIRN_DEPLOYMENT is nope, and this machine has no cairn config: cn init --name nope sets it up (cn init --help)";
  try {
    // Nothing set: the file's default, read as the default.
    const byDefault = cn("doctor", viaFile);
    assert.equal(byDefault.status, 1, "cn doctor passed against a default that does not answer");
    assert.ok(
      byDefault.stdout.includes("deployment dead → http://127.0.0.1:9 (from default, no secret)"),
      "cn doctor does not read the file's default as what chose the deployment",
    );

    // CAIRN_DEPLOYMENT over the default, with the named deployment's url and secret.
    const byName = cn("doctor", { ...viaFile, deployment: "e2e" });
    assert.equal(byName.status, 0, "cn doctor failed on the deployment CAIRN_DEPLOYMENT names");
    assert.ok(
      byName.stdout.includes(
        `deployment e2e → ${url} (from CAIRN_DEPLOYMENT, secret from secrets/e2e)`,
      ),
      "cn doctor does not read CAIRN_DEPLOYMENT as what chose the deployment",
    );
    assert.match(
      byName.stdout,
      /^✓ secret accepted by e2e$/m,
      "the named deployment's secret was not taken",
    );

    // A name the file lacks: one line naming the ones it has, and nothing on stdout.
    const byNothing = cn("doctor", { ...viaFile, deployment: "nope" });
    assert.equal(byNothing.status, 1, "cn doctor passed on a name the file lacks");
    assert.equal(byNothing.stdout, "", "cn doctor printed an answer for a name the file lacks");
    assert.equal(
      byNothing.out,
      `✗ ${missing}\n`,
      "a name the file lacks is not one line naming the deployments it has",
    );

    // CAIRN_URL still wins over a name, even one the file lacks.
    const byUrl = cn("doctor", { xdg: named, deployment: "nope" });
    assert.equal(byUrl.status, 0, "CAIRN_URL did not win over CAIRN_DEPLOYMENT");
    assert.ok(
      byUrl.stdout.includes("(from CAIRN_URL, no secret)"),
      "cn doctor does not read CAIRN_URL as what chose the deployment",
    );

    // The hook, the same three ways.
    const dead = hook({ xdg: named });
    assert.equal(dead.status, 0, "the hook exited non-zero against a dead default");
    assert.equal(
      dead.stdout,
      "cairn: dead did not answer; cn doctor says why\n",
      "the hook does not name the dead default",
    );
    const briefed = hook({ xdg: named, deployment: "e2e" });
    assert.equal(briefed.status, 0, "the hook exited non-zero with CAIRN_DEPLOYMENT=e2e");
    assert.match(briefed.stdout, /^cairn · e2e · /m, "the hook did not print e2e's brief");
    assert.ok(
      !briefed.stdout.includes("did not answer"),
      "the hook said a deployment did not answer when the named one did",
    );
    const started = Date.now();
    const lacking = hook({ xdg: named, deployment: "nope" });
    const took = Date.now() - started;
    assert.equal(lacking.status, 0, "the hook exited non-zero on a name the file lacks");
    assert.equal(
      lacking.stdout,
      `cairn: ${missing}\n`,
      "the hook does not hand on cn's one line for a name the file lacks",
    );
    assert.ok(took < 5000, `the hook took ${took}ms on a name the file lacks, past the 5 s`);

    // A bare --refresh follows the same order: the default, then the name.
    const written = readFileSync(config, "utf8");
    const refreshDead = cn("init --refresh", viaFile);
    assert.equal(refreshDead.status, 1, "cn init --refresh passed against the dead default");
    assert.match(refreshDead.out, /dead/, "cn init --refresh does not name the default it tried");
    assert.equal(readFileSync(config, "utf8"), written, "the refused --refresh wrote anyway");
    const refreshNamed = cn("init --refresh", { ...viaFile, deployment: "e2e" });
    assert.equal(refreshNamed.status, 0, "cn init --refresh failed on the named deployment");
    assert.match(refreshNamed.out, /e2e/, "cn init --refresh does not name the one it refreshed");
    assert.deepEqual(
      JSON.parse(readFileSync(config, "utf8")),
      both,
      "cn init --refresh changed more than the named deployment's secret",
    );
    assert.equal(readFileSync(secretFile, "utf8"), "s3cret\n", "the refreshed secret is not kept");

    // No config at all: the line says there is none.
    const bare = cn("doctor", { xdg: empty, viaConfig: true, deployment: "nope" });
    assert.equal(bare.status, 1, "cn doctor passed on a name with no config at all");
    assert.equal(bare.out, `✗ ${unset}\n`, "a name with no config is not the one line saying so");
    const coldHook = hook({ xdg: empty, deployment: "nope" });
    assert.equal(coldHook.status, 0, "the hook exited non-zero on a name with no config");
    assert.equal(
      coldHook.stdout,
      `cairn: ${unset}\n`,
      "the hook does not hand on cn's one line for a name with no config",
    );
  } finally {
    rmSync(named, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});

row("backend/scripts/clouds.mjs", () => {
  // The files a checkout keeps, one per company it pushes, built here rather than read from
  // backend/, so the row never sees the real deployment's file and cannot reach it.
  last = undefined;
  const dirs = [];
  /** A directory holding exactly `files`, each an env file naming `deployment` or nothing. */
  const holding = (files) => {
    const dir = mkdtempSync(join(tmpdir(), "cairn-e2e-clouds-"));
    dirs.push(dir);
    for (const [file, deployment] of Object.entries(files)) {
      const lines = deployment === undefined ? "" : `CONVEX_DEPLOYMENT=${deployment}\n`;
      writeFileSync(join(dir, file), `${lines}CONVEX_URL=https://a.invalid\n`);
    }
    return dir;
  };
  const oldName =
    "backend/.env.cloud.local is the old name: rename it to backend/.env.cloud.<name>.local, <name> as cn init names the deployment";
  const noCloud =
    "no cloud deployment in backend/: backend/.env.cloud.<name>.local names one, <name> as cn init names it";
  /** The names and deployments a pick runs against, or its refusal as it stands. */
  const picked = (dir, options) => {
    const got = pickClouds({ dir, ...options });
    return got.targets === undefined
      ? got
      : got.targets.map(({ name, deployment }) => ({ name, deployment }));
  };
  try {
    assert.deepEqual(
      picked(holding({})),
      { code: 1, message: noCloud },
      "an empty backend/ is not refused as holding no cloud deployment",
    );
    assert.deepEqual(
      picked(holding({ [OLD_FILE]: "dev:a" })),
      { code: 1, message: oldName },
      "the old file name is not refused with the line to rename it",
    );
    assert.deepEqual(
      picked(holding({ [OLD_FILE]: "dev:a", ".env.cloud.cairn.local": "dev:a" })),
      { code: 1, message: oldName },
      "the old file name is taken when a new one sits beside it",
    );

    const one = holding({ ".env.cloud.cairn.local": "dev:a" });
    const cairn = [{ name: "cairn", deployment: "dev:a" }];
    assert.deepEqual(picked(one), cairn, "one file is not the deployment a push runs against");
    assert.deepEqual(
      picked(one, { one: true }),
      cairn,
      "one file is not the deployment a single-deployment command runs against",
    );
    const full = pickClouds({ dir: one }).targets[0];
    assert.equal(full.envFile, ".env.cloud.cairn.local", "the target does not carry its file name");
    assert.equal(
      full.file,
      join(one, ".env.cloud.cairn.local"),
      "the target's path is not absolute",
    );

    const two = holding({
      ".env.cloud.northwind.local": "dev:b",
      ".env.cloud.cairn.local": "dev:a",
      ".env.local": "anonymous:local",
      ".env.cloud.Bad_Name.local": "dev:c",
    });
    assert.deepEqual(
      picked(two),
      [...cairn, { name: "northwind", deployment: "dev:b" }],
      "a push does not run against every cloud file, in name order, and no decoy",
    );
    assert.deepEqual(
      picked(two, { one: true }),
      { code: 2, message: "name the deployment: backend/ has cairn, northwind" },
      "a single-deployment command picked one of two without a name",
    );
    assert.deepEqual(
      picked(two, { name: "northwind" }),
      [{ name: "northwind", deployment: "dev:b" }],
      "a name does not pick its deployment alone",
    );
    assert.deepEqual(
      picked(two, { name: "nope" }),
      { code: 2, message: "no cloud deployment named nope: backend/ has cairn, northwind" },
      "a name that picks nothing is not refused naming the ones there are",
    );

    const empty = holding({
      ".env.cloud.cairn.local": "dev:a",
      ".env.cloud.empty.local": undefined,
    });
    const unnamed = {
      code: 1,
      message: "backend/.env.cloud.empty.local names no CONVEX_DEPLOYMENT",
    };
    assert.deepEqual(
      picked(empty, { name: "empty" }),
      unnamed,
      "a named file with no CONVEX_DEPLOYMENT was taken",
    );
    assert.deepEqual(
      picked(empty),
      unnamed,
      "a push ran with one of its files naming no CONVEX_DEPLOYMENT",
    );
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
});

row("backend/scripts/page.mjs, backend/convex/convex.config.ts", async () => {
  last = undefined;
  const shipped = await shipPage({ cwd: deployment.dir, env: deployment.env, quiet: true });
  assert.equal(shipped.status, 0, `the page did not ship to the throwaway:\n${shipped.output}`);

  /** A GET against the deployment's site, the way a browser opening the page makes it. */
  const get = async (path) => {
    const response = await fetch(new URL(path, deployment.siteUrl));
    const type = response.headers.get("content-type") ?? "";
    return { status: response.status, type, body: await response.text() };
  };

  const index = await get("/");
  assert.equal(index.status, 200, "the site root does not serve the page");
  assert.match(index.type, /^text\/html/, "the site root is not HTML");
  assert.match(index.body, /<div id="root">/, "the site root is not the page's index.html");
  // Every path the page routes itself is the same index.html, reloaded or opened cold.
  for (const path of ["/cn-1", "/ep-1", "/bl-1"]) {
    const routed = await get(path);
    assert.equal(routed.status, 200, `${path} does not serve the page`);
    assert.equal(routed.body, index.body, `${path} is not the page's index.html`);
  }
  // The script it loads is there, and talks to the deployment that served it.
  const src = index.body.match(/<script[^>]* src="([^"]+)"/)?.[1];
  assert.ok(src, "the page's index.html loads no script");
  const script = await get(src);
  assert.equal(script.status, 200, `${src} is not served`);
  assert.match(script.type, /javascript/, `${src} is not served as JavaScript`);
  assert.ok(script.body.includes(url), "the bundle does not name the deployment that serves it");
  // The Markdown renderer it loads beside itself, by `import()` (apps/web/src/Prose.tsx), is
  // there too, so an issue's text is set rather than left as written.
  const chunk = script.body.match(/import\(["'`]\.\/(Markdown-[\w-]+\.js)["'`]\)/)?.[1];
  assert.ok(chunk, `${src} imports no Markdown renderer`);
  const renderer = await get(src.replace(/[^/]+$/, chunk));
  assert.equal(renderer.status, 200, `${chunk} is not served`);
  assert.match(renderer.type, /javascript/, `${chunk} is not served as JavaScript`);
  // A file the build did not make is a 404, never the page standing in for it.
  const missing = await get("/assets/missing.js");
  assert.equal(missing.status, 404, "a missing asset is answered with something other than 404");
});

row("backend/scripts/pushed.mjs", () => {
  last = undefined;
  /** `recordPush` against the throwaway, the step `#push:cloud` runs after the functions. */
  const record = (value, name) =>
    assert.equal(
      recordPush({ value, name, env: deployment.env, cwd: deployment.dir }),
      0,
      `recording ${value} on the throwaway failed`,
    );
  const on = { cwd: deployment.dir, env: deployment.env };
  /**
   * `deployment.name`, run on the throwaway. convex prints a result as JSON and prints
   * nothing at all for null, so an empty stdout is the query answering null.
   */
  const named = () => {
    const result = convexSync(["run", "deployment:name"], on);
    assert.equal(result.status, 0, `convex run deployment:name failed:\n${result.stderr}`);
    const out = (result.stdout ?? "").trim();
    return out === "" ? null : JSON.parse(out);
  };
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).stdout.trim();
  assert.match(head, /^[0-9a-f]{40}$/, "this checkout has no HEAD to record");
  const at = `the deployment at ${url}`;
  const lastLine = (result) => lines(result.stdout).at(-1);

  record("0".repeat(40));
  assert.equal(named(), null, "a deployment no push named answers a name");
  const unknown = cn("doctor");
  assert.equal(unknown.status, 1, "cn doctor passed against functions from an unknown commit");
  assert.equal(
    lastLine(unknown),
    `✗ ${at} runs functions from 0000000, a commit this checkout has not fetched: git -C ${root} pull --ff-only, then cn doctor again`,
    "cn doctor does not name a commit this checkout has not fetched",
  );

  record(`${head}-dirty`);
  const dirty = pass("doctor", "cn doctor failed on functions pushed with uncommitted changes");
  assert.equal(
    lastLine(dirty),
    `✓ functions on ${at} pushed from ${head.slice(0, 7)} with uncommitted changes, so not compared`,
    "cn doctor compared functions pushed with uncommitted changes",
  );

  // Last, the commit this cn runs from, so every doctor in the rows after stays green.
  record(head, "e2e");
  const held = convexSync(["env", "get", "CAIRN_NAME"], on);
  assert.equal(held.status, 0, "convex env get CAIRN_NAME failed after the push named it");
  assert.equal((held.stdout ?? "").trim(), "e2e", "the push did not record its name");
  assert.equal(named(), "e2e", "deployment.name does not answer the name the push recorded");
  const same = pass("doctor", "cn doctor failed on functions pushed from this checkout's HEAD");
  assert.equal(
    lastLine(same),
    `✓ functions on ${at} pushed from ${head.slice(0, 7)}, the same as this cn's`,
    "cn doctor does not read HEAD's functions as the same as this cn's",
  );
});

row("backend/scripts/secret.mjs (new)", () => {
  // An open deployment has nothing to rotate, and refusing says so without fencing it.
  const open = secretRun("rotate");
  assert.equal(open.status, 2, "rotate on a deployment with no secret was not refused");
  assert.match(open.err.join("\n"), /has no CAIRN_SECRET/, "the refusal does not say why");
  pass("ready", "a refused rotate fenced the deployment anyway");

  const revokeOp = secretRun("revoke", { op: "op://Vault/x" });
  assert.equal(revokeOp.status, 2, "revoke took --op, which hands a secret to somebody");
  const malformed = secretRun("new", { op: "Vault/x" });
  assert.equal(malformed.status, 2, "an --op that is not op://<vault>/<item> was taken");
  assert.match(malformed.err.join("\n"), /--op is op:\/\/<vault>\/<item>/, "not named");

  // The first secret, straight into a 1Password item that does not exist yet.
  writeFileSync(opLog, "");
  const made = secretRun("new", { op: "op://Vault/cairn e2e", env: withOp() });
  assert.equal(made.status, 0, `new --op did not pass:\n${made.err.join("\n")}`);
  assert.deepEqual(made.out, [], "new --op put the secret on stdout as well");
  const calls = opCalls();
  assert.equal(calls.length, 2, "op was not called exactly twice, list then create");
  assert.deepEqual(calls[0].args, ["item", "list", "--vault", "Vault", "--format", "json"]);
  assert.deepEqual(calls[1].args, ["item", "create", "--vault", "Vault"]);
  const a = storedIn(calls[1]);
  assert.match(a, BASE64_32, "the secret is not 32 random bytes as base64");
  assert.deepEqual(
    itemIn(calls[1]),
    {
      title: "cairn e2e",
      category: "SECURE_NOTE",
      fields: [
        { label: "url", type: "URL", value: url },
        { label: "secret", type: "CONCEALED", value: a },
      ],
    },
    "the item is not created with the url and the secret",
  );
  offArgv(calls, a, "new --op");
  unechoed(made.err, a, "new --op");
  assert.ok(
    made.err.some((line) => line.includes("cn init --name e2e --url")),
    "new does not print the line a machine sets up with",
  );
  secrets.a = a;

  const fenced = cn("ready");
  assert.equal(fenced.status, 1, "with a secret set, a call carrying none was answered");
  assert.match(fenced.out, /cn init --refresh/, "the refusal does not name cn init --refresh");
  pass("ready", "the deployment does not take the secret handed to 1Password", { secret: a });

  const again = secretRun("new");
  assert.equal(again.status, 2, "new on a deployment that has a secret was not refused");
  assert.deepEqual(again.out, [], "a refused new printed a secret");
  pass("ready", "a refused new changed the secret", { secret: a });
});

row("backend/scripts/secret.mjs (rotate)", () => {
  const rotated = secretRun("rotate");
  assert.equal(rotated.status, 0, `rotate did not pass:\n${rotated.err.join("\n")}`);
  assert.equal(rotated.out.length, 1, "rotate did not print exactly one secret on stdout");
  const b = rotated.out[0];
  assert.match(b, BASE64_32, "the secret is not 32 random bytes as base64");
  assert.notEqual(b, secrets.a, "rotate set the secret it replaced");
  unechoed(rotated.err, b, "rotate");
  assert.equal(
    cn("ready", { secret: secrets.a }).status,
    1,
    "the rotated-out secret still answers",
  );
  pass("ready", "the rotated-in secret is not taken", { secret: b });

  // Into an item that exists: read whole, edited, and written back with every other field
  // as it was, since the template an edit takes replaces them all. Never created twice.
  writeFileSync(opLog, "");
  const held = {
    id: "i1",
    title: "cairn e2e",
    category: "SECURE_NOTE",
    fields: [
      { id: "notesPlain", label: "notesPlain", type: "STRING", purpose: "NOTES" },
      { id: "f1", label: "url", type: "URL", value: url },
      { id: "f2", label: "secret", type: "CONCEALED", value: "before" },
      { id: "f3", label: "deployment", type: "STRING", value: "e2e" },
    ],
  };
  const edited = secretRun("rotate", {
    op: "op://Vault/cairn e2e",
    env: withOp({ items: JSON.stringify([{ title: "cairn e2e" }]), item: JSON.stringify(held) }),
  });
  assert.equal(edited.status, 0, `rotate --op did not pass:\n${edited.err.join("\n")}`);
  assert.deepEqual(edited.out, [], "rotate --op put the secret on stdout as well");
  const editCalls = opCalls();
  assert.deepEqual(
    editCalls.map(({ args }) => args),
    [
      ["item", "list", "--vault", "Vault", "--format", "json"],
      ["item", "get", "cairn e2e", "--vault", "Vault", "--format", "json"],
      ["item", "edit", "cairn e2e", "--vault", "Vault"],
    ],
    "the item that exists is not read, then edited",
  );
  const c = storedIn(editCalls[2]);
  assert.match(c, BASE64_32, "the secret is not 32 random bytes as base64");
  assert.deepEqual(
    itemIn(editCalls[2]),
    {
      ...held,
      fields: held.fields.map((f) => (f.label === "secret" ? { ...f, value: c } : f)),
    },
    "the edit does not write the item back as it was, its secret aside",
  );
  offArgv(editCalls, c, "rotate --op");
  unechoed(edited.err, c, "rotate --op");
  pass("ready", "the secret written to the item is not taken", { secret: c });
  assert.equal(cn("ready", { secret: b }).status, 1, "the rotated-out secret still answers");
  secrets.c = c;

  // A locked password manager: refused before anything changes.
  const locked = secretRun("rotate", {
    op: "op://Vault/cairn e2e",
    env: withOp({ exit: 1, error: "[ERROR] account is not signed in" }),
  });
  assert.equal(locked.status, 1, "rotate passed with op failing");
  assert.ok(
    locked.err.some((line) => line.includes("nothing changed")),
    "a failed op does not say nothing changed",
  );
  assert.ok(
    locked.err.some((line) => line.includes("[ERROR] account is not signed in")),
    "a failed op's own line is not passed on",
  );
  pass("ready", "an op that failed changed the secret anyway", { secret: c });
});

row("backend/scripts/secret.mjs (revoke)", () => {
  const revoked = secretRun("revoke");
  assert.equal(revoked.status, 0, `revoke did not pass:\n${revoked.err.join("\n")}`);
  assert.deepEqual(revoked.out, [], "revoke handed a secret out");
  assert.equal(revoked.err.length, 1, "revoke did not say exactly one line");
  assert.match(revoked.err[0], /^revoked: /, "revoke's line does not say it revoked");
  assert.equal(cn("ready", { secret: secrets.c }).status, 1, "the revoked secret still answers");
  // Fenced, not opened: a call with no secret is refused too.
  assert.equal(cn("ready").status, 1, "revoke opened the deployment to a call with no secret");

  const held = convexSync(["env", "get", "CAIRN_SECRET"], {
    cwd: deployment.dir,
    env: deployment.env,
  });
  assert.equal(held.status, 0, "convex env get CAIRN_SECRET failed after revoke");
  const value = (held.stdout ?? "").trim();
  assert.ok(value !== "", "revoke left the deployment with no CAIRN_SECRET, which is open");
  assert.ok(value !== secrets.c, "revoke left the secret it revoked in place");

  // The one command that would open the deployment is not in the script at all.
  const source = readFileSync(join(root, "backend", "scripts", "secret.mjs"), "utf8");
  assert.ok(
    !/["'`](remove|rm)["'`]/.test(source),
    "secret.mjs names convex env remove, which opens a deployment",
  );
});

row("verbs/init.mts (refresh)", () => {
  const warm = mkdtempSync(join(tmpdir(), "cairn-e2e-warm-"));
  try {
    const heldFile = join(warm, "held");
    const config = join(warm, "cairn", "config.json");
    const viaFile = { xdg: warm, viaConfig: true };
    const bytes = () => readFileSync(config, "utf8");

    // The rotate after a revoke is what lets machines back in.
    const rotated = secretRun("rotate");
    assert.equal(rotated.status, 0, `rotate after revoke did not pass:\n${rotated.err.join("\n")}`);
    const d = rotated.out[0];
    writeFileSync(heldFile, d);

    // A machine set up before commands were stored, before secrets/ (so the secret is
    // cached in the file, as a cn from before wrote it), and before capabilities went
    // (cn-118): no command beside the secret, and a `can` that loads and nothing reads.
    const before = { default: "e2e", can: ["web"], deployments: { e2e: { url, secret: "stale" } } };
    mkdirSync(join(warm, "cairn"), { recursive: true });
    writeFileSync(config, `${JSON.stringify(before, null, 2)}\n`, { mode: 0o600 });
    const original = bytes();
    const secretsDir = join(warm, "cairn", "secrets");
    const secretFile = join(secretsDir, "e2e");

    assert.equal(cn("ready", viaFile).status, 1, "the stale secret is taken");
    const doctored = cn("doctor", viaFile);
    assert.equal(doctored.status, 1, "cn doctor passed on a refused secret");
    assert.match(
      doctored.out,
      /^✗ e2e refused the secret this machine holds: cn init --refresh --name e2e takes the current one$/m,
      "cn doctor does not name cn init --refresh for a refused secret",
    );
    assert.match(
      doctored.out,
      /secret from config\.json; cn init --refresh --name e2e moves it to secrets\/e2e/,
      "cn doctor does not name the refresh that moves a secret cached in the file",
    );
    assert.equal(bytes(), original, "a read rewrote the config");
    assert.ok(!existsSync(secretsDir), "a read wrote secrets/");

    const bare = cn("init --refresh", viaFile);
    assert.equal(bare.status, 1, "cn init --refresh with no command anywhere passed");
    assert.match(bare.out, /--secret-cmd/, "the refusal does not name --secret-cmd");
    assert.equal(bytes(), original, "a refused cn init --refresh wrote anyway");
    assert.equal(cn("init --refresh --url x", viaFile).status, 2, "--refresh took --url");
    assert.equal(cn("init --refresh --name nope", viaFile).status, 1, "a missing name passed");
    assert.equal(bytes(), original, "a refresh of a missing name wrote anyway");

    const command = `cat ${heldFile}`;
    const first = pass(
      `init --refresh --secret-cmd '${command}'`,
      "cn init --refresh did not take the rotated secret",
      viaFile,
    );
    assert.ok(!first.out.includes(d), "cn init --refresh printed the secret");
    assert.deepEqual(
      JSON.parse(bytes()),
      { ...before, deployments: { e2e: { url, secretCmd: command } } },
      "cn init --refresh changed more than the command, or left the secret in the file",
    );
    assert.equal(statSync(config).mode & 0o777, 0o600, "the config is not mode 600");
    assert.equal(readFileSync(secretFile, "utf8"), `${d}\n`, "the secret did not land");
    assert.equal(statSync(secretFile).mode & 0o777, 0o600, "the secret is not mode 600");
    assert.equal(statSync(secretsDir).mode & 0o777, 0o700, "secrets/ is not mode 700");
    pass("ready", "the refreshed config is not answered", viaFile);

    // The next rotation: the stored command alone takes it.
    const next = secretRun("rotate");
    assert.equal(next.status, 0, `the second rotate did not pass:\n${next.err.join("\n")}`);
    const e = next.out[0];
    writeFileSync(heldFile, e);
    assert.equal(cn("ready", viaFile).status, 1, "the rotated-out secret still answers");
    pass("init --refresh", "cn init --refresh did not run the stored command", viaFile);
    const refreshed = JSON.parse(bytes()).deployments.e2e;
    assert.equal(refreshed.secretCmd, command, "the stored command changed");
    assert.ok(!("secret" in refreshed), "the refresh wrote a secret into the file");
    assert.equal(
      readFileSync(secretFile, "utf8"),
      `${e}\n`,
      "the stored command's secret was not written",
    );
    pass("ready", "the refreshed config is not answered", viaFile);
    const healthy = pass("doctor", "cn doctor failed after cn init --refresh", viaFile);
    assert.match(healthy.out, /^✓ secret accepted by e2e$/m, "the refreshed secret is not taken");

    // A command that prints the wrong secret writes nothing.
    writeFileSync(heldFile, "wrong");
    const kept = bytes();
    const keptSecret = readFileSync(secretFile, "utf8");
    const wrong = cn("init --refresh", viaFile);
    assert.equal(wrong.status, 1, "cn init --refresh wrote a secret the deployment refused");
    assert.match(wrong.out, /nothing written/, "the refusal does not say nothing was written");
    assert.equal(bytes(), kept, "a refused secret was written anyway");
    assert.equal(readFileSync(secretFile, "utf8"), keptSecret, "a refused secret was kept anyway");
  } finally {
    rmSync(warm, { recursive: true, force: true });
  }
});

row("backend/scripts/new-cloud.mjs (files)", async () => {
  // What `#new:cloud` does around convex, with a stand-in convex that writes `.env.local`
  // the way convex 1.46 does. No network and no account: the directory it runs in and the
  // HOME it reads a login from are both built here, so neither backend/ nor this machine's
  // ~/.convex is ever read or written.
  last = undefined;
  const scratch = mkdtempSync(join(tmpdir(), "cairn-e2e-newcloud-"));
  try {
    const dir = join(scratch, "backend");
    const fakeHome = join(scratch, "home");
    mkdirSync(dir);
    mkdirSync(join(fakeHome, ".convex"), { recursive: true });
    const login = join(fakeHome, ".convex", "config.json");
    const envLocal = join(dir, ".env.local");
    const cloudFile = (name) => join(dir, `.env.cloud.${name}.local`);
    const env = { PATH: process.env.PATH, HOME: fakeHome };
    const original =
      "CONVEX_DEPLOYMENT=anonymous:anonymous-backend\nCONVEX_URL=http://127.0.0.1:3210\n";
    /** What convex 1.46 leaves in `.env.local` once it has made a deployment. */
    // convex names the URL after the framework it detects in package.json's dependencies,
    // `VITE_CONVEX_URL` in backend/ since vitest brings vite, and `CONVEX_URL` where it
    // sees none; the HTTP actions URL lands beside it under `…CONVEX_SITE_URL` either way.
    const made = (deployment, team, project, key = "VITE_CONVEX_URL") =>
      `# Deployment used by \`npx convex dev\`\nCONVEX_DEPLOYMENT=${deployment} # team: ${team}, project: ${project}\n\n${key}=https://${deployment.slice(4)}.convex.cloud\n${key.replace(/CONVEX_URL$/, "CONVEX_SITE_URL")}=https://${deployment.slice(4)}.convex.site\n`;
    const next = (name) =>
      `next: vp run -F @cairn/backend secret -- new ${name} --op "op://<vault>/cairn ${name} deployment"`;
    const noLogin =
      "not logged in to Convex on this machine: npx convex login, from backend/, logs in; nothing created";

    /**
     * `newCloud` with a stand-in convex that records how it was called, leaves `write` in
     * `.env.local` when given, then throws when told to or exits `status`.
     */
    const attempt = async (options, { write, status = 0, throws = false } = {}) => {
      const calls = [];
      const lines = [];
      const code = await newCloud({
        dir,
        env,
        err: (line) => lines.push(line),
        ...options,
        run: async (args, { cwd, env: childEnv }) => {
          calls.push({ args, cwd, env: childEnv });
          if (write !== undefined) writeFileSync(join(cwd, ".env.local"), write);
          if (throws) throw new Error("convex fell over");
          return status;
        },
      });
      return { code, calls, lines };
    };

    writeFileSync(login, '{"accessToken":"x"}');
    const bad = await attempt({ name: "Bad_Name" });
    assert.equal(bad.code, 2, "a name cn init would refuse was not refused");
    assert.deepEqual(bad.lines, [
      'the name is lowercase letters, digits and dashes, as cn init --name takes it, not "Bad_Name"',
    ]);
    assert.equal(bad.calls.length, 0, "convex ran for a bad name");
    assert.deepEqual(readdirSync(dir), [], "a bad name wrote a file");

    writeFileSync(cloudFile("taken"), "CONVEX_DEPLOYMENT=dev:taken-1\n");
    const taken = await attempt({ name: "taken" });
    assert.equal(taken.code, 2, "a name the checkout keeps was not refused");
    assert.deepEqual(taken.lines, [
      "backend/.env.cloud.taken.local exists: this checkout already keeps a deployment called taken; nothing created",
    ]);
    assert.equal(taken.calls.length, 0, "convex ran for a name the checkout keeps");
    assert.equal(
      readFileSync(cloudFile("taken"), "utf8"),
      "CONVEX_DEPLOYMENT=dev:taken-1\n",
      "the file already there changed",
    );

    rmSync(login);
    const out = await attempt({ name: "acme" });
    assert.equal(out.code, 1, "no login was not refused");
    assert.deepEqual(out.lines, [noLogin]);
    assert.equal(out.calls.length, 0, "convex ran with no login");
    writeFileSync(login, "not json");
    const garbled = await attempt({ name: "acme" });
    assert.equal(garbled.code, 1, "a login file that does not parse counted as a login");
    assert.deepEqual(garbled.lines, [noLogin]);
    assert.equal(garbled.calls.length, 0, "convex ran with a login file that does not parse");

    writeFileSync(login, '{"accessToken":"x"}');
    writeFileSync(envLocal, original);
    const acme = await attempt(
      {
        name: "acme",
        env: {
          ...env,
          CONVEX_DEPLOYMENT: "dev:elsewhere",
          CONVEX_DEPLOY_KEY: "k",
          CONVEX_AGENT_MODE: "anonymous",
        },
      },
      { write: made("dev:happy-otter-123", "acme", "cairn-acme") },
    );
    assert.equal(acme.code, 0, `the creation did not pass:\n${acme.lines.join("\n")}`);
    assert.equal(acme.calls.length, 1, "convex did not run exactly once");
    const [call] = acme.calls;
    assert.deepEqual(call.args, [
      "dev",
      "--once",
      "--configure",
      "new",
      "--project",
      "cairn-acme",
      "--dev-deployment",
      "cloud",
      "--skip-push",
    ]);
    assert.equal(call.cwd, dir, "convex did not run in the directory given");
    for (const key of [
      "CONVEX_DEPLOYMENT",
      "CONVEX_DEPLOY_KEY",
      "CONVEX_DEPLOYMENT_TOKEN",
      "CONVEX_URL",
      "CONVEX_AGENT_MODE",
    ]) {
      assert.ok(!(key in call.env), `convex's environment carries ${key}`);
    }
    assert.equal(call.env.HOME, fakeHome, "convex's environment lost HOME");
    assert.equal(call.env.PATH, process.env.PATH, "convex's environment lost PATH");
    assert.equal(
      readFileSync(cloudFile("acme"), "utf8"),
      "# The cloud deployment cn init calls acme, made by #new:cloud. #push:cloud, #dev:cloud and #secret read this.\n" +
        "# team: acme, project: cairn-acme\n" +
        "CONVEX_DEPLOYMENT=dev:happy-otter-123\n" +
        "CONVEX_URL=https://happy-otter-123.convex.cloud\n",
      "the cloud file is not the four lines",
    );
    assert.equal(readFileSync(envLocal, "utf8"), original, ".env.local was not put back");
    assert.deepEqual(acme.lines, [
      "creating Convex project cairn-acme for acme",
      "created acme: dev:happy-otter-123 at https://happy-otter-123.convex.cloud, in backend/.env.cloud.acme.local",
      next("acme"),
    ]);
    const picked = pickClouds({ dir, name: "acme" });
    assert.deepEqual(
      picked.targets?.map((t) => t.deployment),
      ["dev:happy-otter-123"],
      "the file is not the deployment #push:cloud and #secret read",
    );

    const beta = await attempt(
      { name: "beta", team: "acme-co", project: "worklist" },
      { write: made("dev:brave-lynx-456", "acme-co", "worklist") },
    );
    assert.equal(beta.code, 0, `the creation in a team did not pass:\n${beta.lines.join("\n")}`);
    assert.deepEqual(beta.calls[0].args, [
      "dev",
      "--once",
      "--configure",
      "new",
      "--project",
      "worklist",
      "--dev-deployment",
      "cloud",
      "--skip-push",
      "--team",
      "acme-co",
    ]);
    assert.equal(beta.lines[0], "creating Convex project worklist for beta in team acme-co");

    const idle = await attempt({ name: "idle" }, { status: 1 });
    assert.equal(idle.code, 1, "a convex that made nothing passed");
    assert.deepEqual(idle.lines, [
      "creating Convex project cairn-idle for idle",
      "convex created nothing (exit 1); nothing written",
    ]);
    assert.ok(!existsSync(cloudFile("idle")), "a convex that made nothing left a cloud file");
    assert.equal(readFileSync(envLocal, "utf8"), original, ".env.local moved after a failure");

    const late = await attempt(
      { name: "late" },
      { write: made("dev:late-otter-789", "acme", "cairn-late"), status: 1 },
    );
    assert.equal(late.code, 1, "a convex that failed after creating passed");
    assert.ok(existsSync(cloudFile("late")), "a deployment convex made has no file");
    assert.deepEqual(late.lines, [
      "creating Convex project cairn-late for late",
      "created late: dev:late-otter-789 at https://late-otter-789.convex.cloud, in backend/.env.cloud.late.local",
      "convex exited 1 after creating it; the file is written",
      next("late"),
    ]);

    rmSync(envLocal);
    // A package convex sees no framework in gets a bare CONVEX_URL, read the same way.
    const fresh = await attempt(
      { name: "fresh" },
      { write: made("dev:fresh-fox-1", "acme", "cairn-fresh", "CONVEX_URL") },
    );
    assert.equal(fresh.code, 0, `the creation with no .env.local did not pass`);
    assert.ok(existsSync(cloudFile("fresh")), "the creation with no .env.local wrote no file");
    assert.match(
      readFileSync(cloudFile("fresh"), "utf8"),
      /^CONVEX_URL=https:\/\/fresh-fox-1\.convex\.cloud$/m,
      "a bare CONVEX_URL was not read",
    );
    assert.ok(!existsSync(envLocal), "an .env.local that was not there was left behind");

    writeFileSync(envLocal, original);
    const noUrl = await attempt({ name: "nourl" }, { write: "CONVEX_DEPLOYMENT=dev:no-url-1\n" });
    assert.equal(noUrl.code, 1, "a deployment with no URL passed");
    assert.deepEqual(noUrl.lines, [
      "creating Convex project cairn-nourl for nourl",
      "convex made dev:no-url-1 but wrote no URL beside it; backend/.env.cloud.nourl.local is not written",
      "finish by hand, since running this again would make a second project: write backend/.env.cloud.nourl.local with CONVEX_DEPLOYMENT=dev:no-url-1 and CONVEX_URL=<its URL, from https://dashboard.convex.dev>, then run the next: line",
      next("nourl"),
    ]);
    assert.ok(!existsSync(cloudFile("nourl")), "a deployment with no URL got a file");

    await assert.rejects(
      attempt(
        { name: "thrown" },
        { write: made("dev:thrown-1", "acme", "cairn-thrown"), throws: true },
      ),
      /convex fell over/,
      "a convex that threw did not reject",
    );
    assert.equal(
      readFileSync(envLocal, "utf8"),
      original,
      ".env.local was not put back after a throw",
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------

/** Runs the rows in order, stopping at the first failure: each one reads the last's state. */
async function runRows() {
  for (const { name, fn } of rows) {
    try {
      await fn();
    } catch (e) {
      console.log(`✗ ${name}`);
      console.error(e.message);
      if (last) {
        console.error(`  cn ${last.line}`);
        console.error(`  exit ${last.status}`);
        for (const line of last.out.split("\n")) console.error(`  ${line}`);
      }
      return false;
    }
    console.log(`✓ ${name}`);
  }
  return true;
}

let deployment;
let passed = false;

/**
 * The stand-in `op`, as a node script. It behaves as op.exe does through WSL, where any
 * stdin that is not a terminal is a JSON template, an empty one included: `item create`
 * and `item edit` refuse stdin that does not parse, with op's own line.
 */
const OP_STUB = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const stdin = fs.readFileSync(0, "utf8");
fs.appendFileSync(process.env.OP_STUB_LOG, JSON.stringify({ args, stdin }) + "\\n");
if (process.env.OP_STUB_ERR) process.stderr.write(process.env.OP_STUB_ERR + "\\n");
const exit = Number(process.env.OP_STUB_EXIT ?? 0);
if (exit !== 0) process.exit(exit);
if (args[0] === "item" && (args[1] === "create" || args[1] === "edit")) {
  try {
    JSON.parse(stdin);
  } catch {
    process.stderr.write("[ERROR] invalid JSON in piped input\\n");
    process.exit(1);
  }
}
if (args[0] === "item" && args[1] === "list") process.stdout.write(process.env.OP_STUB_ITEMS ?? "[]");
if (args[0] === "item" && args[1] === "get") process.stdout.write(process.env.OP_STUB_ITEM ?? "{}");
process.exit(0);
`;

const teardown = async () => {
  for (const [dir, clear] of [
    [home, () => (home = undefined)],
    [cold, () => (cold = undefined)],
    [bin, () => (bin = undefined)],
    [opBin, () => (opBin = undefined)],
  ]) {
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
    clear();
  }
  if (deployment) {
    const stopping = deployment;
    deployment = undefined;
    await stopping.stop();
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
  home = mkdtempSync(join(tmpdir(), "cairn-e2e-"));
  // The `cn init` row needs a machine that has nothing: its own empty config home, and a
  // `cn` on PATH for the SessionStart hook, which is all that hook looks for.
  cold = mkdtempSync(join(tmpdir(), "cairn-e2e-cold-"));
  bin = mkdtempSync(join(tmpdir(), "cairn-e2e-bin-"));
  symlinkSync(join(root, "packages", "cli", "bin", "cn"), join(bin, "cn"));
  // The secret rows' `op`: it logs every call with its stdin, prints `$OP_STUB_ITEMS` for
  // `item list` and `$OP_STUB_ITEM` for `item get`, refuses a create or an edit whose stdin
  // is not JSON, and fails with `$OP_STUB_ERR` when `$OP_STUB_EXIT` says to. 1Password is
  // never reached.
  opBin = mkdtempSync(join(tmpdir(), "cairn-e2e-op-"));
  opLog = join(opBin, "log");
  writeFileSync(join(opBin, "op"), OP_STUB);
  chmodSync(join(opBin, "op"), 0o755);
  passed = await runRows();
  if (passed) console.log(`e2e: ${rows.length} rows passed against an empty throwaway deployment`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  passed = false;
} finally {
  try {
    await teardown();
  } catch (e) {
    console.error(`✗ ${e.message}`);
    passed = false;
  }
}

process.exit(passed ? 0 : 1);
