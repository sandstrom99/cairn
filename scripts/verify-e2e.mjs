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
// runs with XDG_CONFIG_HOME pointed at a temp directory, so ~/.config/cairn/config.json
// cannot be read even if CAIRN_URL went missing. The `cn init` row is the one that writes
// a config at all, and it writes into a second temp directory it starts empty.
//
// A call is written the way it is typed: `cn("claim cn-2")`, with quotes holding a title
// together; `pass(line, why)` is the call that has to exit 0, and `json(line)` a read
// verb's --json parsed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
/** The last `cn` call, which is what a failed row prints beside its assertion. */
let last;

/** The environment every call gets: nothing of this machine's cairn, everything of this run's. */
function environment({ as, xdg, viaConfig, session }) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("CAIRN_")) delete env[key];
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
 * CAIRN_URL so it has to.
 */
function cn(line, { as = "agent", xdg = home, viaConfig = false, session } = {}) {
  const env = environment({ as, xdg, viaConfig, session });
  const result = spawnSync(process.execPath, [MAIN, ...words(line)], {
    encoding: "utf8",
    cwd: xdg,
    env,
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
 * file it sources before every Bash command of that session.
 */
function hook({ session, envFile, xdg = cold } = {}) {
  const env = environment({ as: "agent", xdg, viaConfig: true });
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
  assert.match(seen.out, /^✓ actor e2e\/claude \(agent\), no session$/m, "no actor line");
  assert.match(seen.out, /^✓ can nothing declared$/m, "no can line with nothing declared");
  assert.match(
    cn("doctor", { session: "s-doc" }).out,
    /^✓ actor e2e\/claude \(agent\), session s-doc$/m,
    "the actor line does not carry the session",
  );

  const checks = json("doctor");
  assert.deepEqual(
    checks.map((c) => c.check),
    ["node", "api", "deployment", "actor", "can", "ping"],
    "cn doctor --json is not the checks as rows",
  );
  assert.ok(
    checks.every((c) => c.ok === true && typeof c.line === "string"),
    `cn doctor --json has a failing check: ${JSON.stringify(checks)}`,
  );
});

row("verbs/project.mts", () => {
  pass(`project new cn --name 'cairn: backend, cli, plugin'`, "cn project new cn was refused");
  assert.ok(
    json("project list").some((p) => p.slug === "cn"),
    "cn project list does not read the project back",
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
  const first = pass(
    `create --project cn --epic ep-1 --title 'scratch: first' --description "scratch: the first line\n\nand a second paragraph"`,
    "cn create was refused",
  );
  assert.match(first.out, /cn-1/, "the first issue did not mint cn-1");
  const second = pass(
    `create --project cn --epic ep-1 --title 'scratch: second'`,
    "the second cn create was refused",
  );
  assert.match(second.out, /cn-2/, "the second issue did not mint cn-2");
  const orphan = cn(`create --project cn --title 'scratch: no epic'`);
  assert.equal(orphan.status, 1, "a create with no --epic was not refused");
  assert.match(orphan.out, /ep-1/, "the refusal does not list the open epics");
});

row("verbs/list.mts", () => {
  const listed = json("list --epic ep-1");
  assert.deepEqual(ids(listed), ["cn-1", "cn-2"], "cn list is not priority then age");
  for (const issue of listed) assert.equal(typeof issue.title, "string", "--json has no title");
});

row("verbs/ready.mts", () => {
  const made = pass(
    `create --project cn --epic ep-1 --title 'scratch: needs ios' --requires ios`,
    "cn create --requires ios was refused",
  );
  assert.match(made.out, /cn-3/, "the third issue did not mint cn-3");

  const all = pass("ready", "cn ready exited non-zero");
  for (const id of ["cn-1", "cn-2", "cn-3"]) assert.match(all.out, new RegExp(id));

  const web = pass("ready --can web", "cn ready --can web exited non-zero");
  const marked = lines(web.stdout).find((l) => l.includes("cn-3"));
  assert.ok(marked, "cn ready --can web hides the row it cannot do instead of marking it");
  assert.match(marked, /needs ios/, "the row is not marked with what it needs");

  // A positional is a --can the caller forgot to name, and it is refused, not run past.
  const stray = cn("ready ios");
  assert.equal(stray.status, 2, "cn ready ios ran past a positional instead of refusing it");
  assert.match(stray.stderr, /got "ios"/, "the refusal does not name the positional");
  assert.equal(stray.stdout, "", "cn ready ios printed an answer beside the refusal");
});

row("verbs/brief.mts", () => {
  const brief = pass("brief", "cn brief exited non-zero");
  assert.ok(lines(brief.stdout).length < 20, "cn brief is 20 lines or more");
  pass("brief --can decision", "cn brief --can exited non-zero");
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
  pass("release cn-2", "cn release cn-2 was refused");
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
});

row("verbs/journal.mts", () => {
  const body = "scratch: a finding";
  pass(`journal cn-2 --kind finding '${body}'`, "cn journal was refused");
  assert.equal(json("show cn-2").journal[0].body, body, "the entry is not shown newest first");
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
  pass("dep rm cn-2 --blocked-by cn-1", "cn dep rm refused");
  assert.deepEqual(ids(json("show cn-2").blockedBy), [], "the edge survived cn dep rm");
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
  assert.equal(cn("ack bl-1").status, 1, "an agent was allowed to ack a blocker");
  pass("ack bl-1", "a person's ack was refused", { as: "human" });
  pass("resolve bl-1 --note done", "a person's resolve was refused", { as: "human" });
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
  const printed = cn("show cn-2");
  assert.match(printed.out, /^status {10}closed just now · /m, "cn show does not read the close");
  assert.match(
    printed.out,
    /^proof {11}echo proof \(exit 0\) by \S+ just now$/m,
    "cn show does not print the proof as its line",
  );

  // The last thing holding cn-3 closes, and the answer says so the way cn ready would. The
  // e2e session has no can, so the row is marked with what cn-3 requires.
  const freed = pass(
    `close cn-1 --revision ${revisionOf("cn-1")} --run 'echo proof'`,
    "the second cn close cn-1 was refused",
  );
  assert.ok(
    lines(freed.stdout).some((l) =>
      /^ {2}ready {6}cn-3 "scratch: needs ios" P2 open {2}ep-1 "Create to close" r\d+ · needs ios$/.test(
        l,
      ),
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
    whole.some((l) => /^cn-4 ".*  blocker\.resolve  .*  just now  bl-1 "scratch": done$/.test(l)),
    "the resolve that freed cn-4 does not read as the blocker and the note",
  );
  assert.ok(
    // The person's actor is the runner's own user, so it is not pinned here.
    whole.some((l) =>
      /^bl-1 "scratch"  blocker\.resolve  \S+  just now  resolution — → done, status waiting → resolved$/.test(
        l,
      ),
    ),
    "the blocker's own resolve does not read as a field map",
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
  const made = pass(
    `${setup} --can web android`,
    "cn init was refused against a deployment that answers",
    viaFile,
  );
  assert.ok(!made.out.includes("s3cret"), "cn init printed the secret it was given");
  assert.equal(statSync(config).mode & 0o777, 0o600, "the config is not mode 600");
  assert.deepEqual(JSON.parse(readFileSync(config, "utf8")), {
    default: "e2e",
    can: ["web", "android"],
    deployments: { e2e: { url, secret: "s3cret" } },
  });

  // The file alone is enough from here: nothing in the environment names a deployment.
  const doctored = pass("doctor", "cn doctor failed on the config cn init just wrote", viaFile);
  assert.match(doctored.out, /e2e/, "cn doctor does not name the deployment it resolved");
  assert.match(doctored.out, /from config/, "cn doctor does not name the config as the source");
  assert.match(doctored.out, /^✓ can web android$/m, "cn doctor does not read can from the file");
  assert.match(
    doctored.out,
    /^✓ secret accepted by e2e$/m,
    "the secret the file holds was not taken",
  );

  const written = readFileSync(config, "utf8");
  const again = cn(`${setup} --can web android`, viaFile);
  assert.equal(again.status, 1, "cn init replaced a deployment that was already there");
  assert.match(again.out, /already a deployment/, "the refusal does not say the name is taken");
  assert.equal(readFileSync(config, "utf8"), written, "the refused cn init wrote anyway");

  pass(`init --name other --url ${url}`, "a second deployment was refused", viaFile);
  const both = JSON.parse(readFileSync(config, "utf8"));
  assert.deepEqual(sorted(Object.keys(both.deployments)), ["e2e", "other"], "both are not there");
  assert.equal(both.default, "e2e", "a second deployment took the default without --default");
  assert.deepEqual(both.can, ["web", "android"], "a second deployment rewrote can");
  assert.ok(!("secret" in both.deployments.other), "a deployment with no secret got a secret key");

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
  assert.match(warm.stdout, /can web android/, "the brief does not carry what the config said");

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

// ---------------------------------------------------------------------------

/** Runs the rows in order, stopping at the first failure: each one reads the last's state. */
function runRows() {
  for (const { name, fn } of rows) {
    try {
      fn();
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

const teardown = async () => {
  for (const [dir, clear] of [
    [home, () => (home = undefined)],
    [cold, () => (cold = undefined)],
    [bin, () => (bin = undefined)],
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
  passed = runRows();
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
