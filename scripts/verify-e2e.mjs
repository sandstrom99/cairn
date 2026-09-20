// verify-e2e.mjs: the per-verb rows of AGENTS.md's verify table, run for real.
//
//   vp run verify:e2e
//
// The table says what to run when a verb changes; this is that list executed, in table
// order, with the real `cn` against a real deployment. A row's name here is the table's
// "Changed" cell, so the two are greppable against each other and a row that exists in
// one and not the other shows up as a missing name.
//
// It runs from an empty deployment, which is what makes the ids the rows name the ids
// that get minted: the first epic is ep-1, the first issue cn-1, the first blocker bl-1.
// `backend/scripts/throwaway.mjs` starts that deployment on OS-chosen ports with its own
// state directory and deletes both afterwards. The target is only ever the deployment
// this script started — never the worklist, never the local dev copy on 3210 — and `cn`
// runs with XDG_CONFIG_HOME pointed at a temp directory, so ~/.config/cairn/config.json
// cannot be read even if CAIRN_URL went missing. The `cn init` row is the one that writes
// a config at all, and it writes into a second temp directory it starts empty.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startThrowaway } from "../backend/scripts/throwaway.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MAIN = join(root, "packages", "cli", "src", "main.mts");
const HOOK = join(root, "plugins", "cairn", "hooks", "session-start.sh");

/** The deployment under test and the config home cn reads, both set up in `main`. */
let url;
let home;
/** The config home the `cn init` row starts empty, and a directory holding a `cn` on PATH. */
let cold;
let bin;
/** The last `cn` call, which is what a failed row prints beside its assertion. */
let last;

/** The environment every call gets: nothing of this machine's cairn, everything of this run's. */
function environment({ as, xdg, viaConfig }) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("CAIRN_")) delete env[key];
  delete env.CLAUDECODE;
  // A `viaConfig` call names no deployment in the environment, so the only place one can
  // come from is the file under XDG_CONFIG_HOME — which is what `cn init` writes.
  if (!viaConfig) env.CAIRN_URL = url;
  env.CAIRN_HOST = "e2e";
  env.XDG_CONFIG_HOME = xdg;
  if (as !== "human") env.CLAUDECODE = "1";
  if (as === "other") env.CAIRN_ACTOR = "other/agent";
  return env;
}

/**
 * One `cn` run. `as` is who the call is: an agent (CLAUDECODE set, actor `e2e/claude`),
 * a person (no CLAUDECODE), or a second agent on another machine (CAIRN_ACTOR set).
 * `xdg` is the config home it reads, and `viaConfig` withholds CAIRN_URL so it has to.
 */
function cn(args, { as = "agent", xdg = home, viaConfig = false } = {}) {
  const env = environment({ as, xdg, viaConfig });
  const result = spawnSync(process.execPath, [MAIN, ...args], { encoding: "utf8", cwd: xdg, env });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  last = { args, status: result.status, stdout, stderr, out: stdout + stderr };
  return last;
}

/** The SessionStart hook, run as a cold machine with `cn` on PATH and no deployment. */
function hook() {
  const env = environment({ as: "agent", xdg: cold, viaConfig: true });
  env.PATH = `${bin}:${env.PATH ?? ""}`;
  const result = spawnSync("bash", [HOOK], { encoding: "utf8", cwd: cold, env });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  last = { args: ["(hook)"], status: result.status, stdout, stderr, out: stdout + stderr };
  return last;
}

/** A read verb's `--json`, parsed. Anything but exit 0 is the row failing. */
function json(args, opts) {
  const result = cn([...args, "--json"], opts);
  assert.equal(result.status, 0, `cn ${args.join(" ")} --json exited ${result.status}`);
  return JSON.parse(result.stdout);
}

/** Revisions are read, never assumed: every write below carries what cn last printed. */
const revisionOf = (id) => json(["show", id]).revision;

const ids = (rows) => rows.map((r) => r.id);
/** Ids in a stable order, for a comparison where the order carries no meaning. */
const sorted = (list) => [...list].sort((a, b) => a.localeCompare(b));
const lines = (text) => text.split("\n").filter((l) => l.trim() !== "");

const rows = [];
const row = (name, fn) => rows.push({ name, fn });

// ---------------------------------------------------------------------------
// The rows, in the order AGENTS.md lists them. Each leaves the state the next reads.

row("verbs/doctor.mts", () => {
  const seen = cn(["doctor"]);
  assert.equal(seen.status, 0, "cn doctor did not pass against the throwaway deployment");
  assert.match(seen.out, /deployment answered: 0 project\(s\)/);
});

row("verbs/project.mts", () => {
  const made = cn(["project", "new", "cn", "--name", "cairn: backend, cli, plugin"]);
  assert.equal(made.status, 0, "cn project new cn was refused");
  const projects = json(["project", "list"]);
  assert.ok(
    projects.some((p) => p.slug === "cn"),
    "cn project list does not read the project back",
  );
});

row("verbs/epic.mts", () => {
  const made = cn(["epic", "new", "Create to close"]);
  assert.equal(made.status, 0, "cn epic new was refused");
  assert.match(made.out, /ep-1/, "the first epic did not mint ep-1");
  const listed = cn(["epic", "list"]);
  assert.equal(listed.status, 0, "cn epic list exited non-zero");
  assert.match(listed.out, /ep-1/);
  assert.match(listed.out, /Create to close/);
});

row("verbs/create.mts", () => {
  const first = cn(["create", "--project", "cn", "--epic", "ep-1", "--title", "scratch: first"]);
  assert.equal(first.status, 0, "cn create was refused");
  assert.match(first.out, /cn-1/, "the first issue did not mint cn-1");
  const second = cn(["create", "--project", "cn", "--epic", "ep-1", "--title", "scratch: second"]);
  assert.equal(second.status, 0, "the second cn create was refused");
  assert.match(second.out, /cn-2/, "the second issue did not mint cn-2");
  const orphan = cn(["create", "--project", "cn", "--title", "scratch: no epic"]);
  assert.equal(orphan.status, 1, "a create with no --epic was not refused");
  assert.match(orphan.out, /ep-1/, "the refusal does not list the open epics");
});

row("verbs/list.mts", () => {
  const listed = json(["list", "--epic", "ep-1"]);
  assert.deepEqual(ids(listed), ["cn-1", "cn-2"], "cn list is not priority then age");
  for (const issue of listed) assert.equal(typeof issue.title, "string", "--json has no title");
});

row("verbs/ready.mts", () => {
  const made = cn([
    "create",
    "--project",
    "cn",
    "--epic",
    "ep-1",
    "--title",
    "scratch: needs ios",
    "--requires",
    "ios",
  ]);
  assert.equal(made.status, 0, "cn create --requires ios was refused");
  assert.match(made.out, /cn-3/, "the third issue did not mint cn-3");

  const all = cn(["ready"]);
  assert.equal(all.status, 0, "cn ready exited non-zero");
  for (const id of ["cn-1", "cn-2", "cn-3"]) assert.match(all.out, new RegExp(id));

  const web = cn(["ready", "--can", "web"]);
  assert.equal(web.status, 0, "cn ready --can web exited non-zero");
  const marked = lines(web.stdout).find((l) => l.includes("cn-3"));
  assert.ok(marked, "cn ready --can web hides the row it cannot do instead of marking it");
  assert.match(marked, /needs ios/, "the row is not marked with what it needs");
});

row("verbs/brief.mts", () => {
  const brief = cn(["brief"]);
  assert.equal(brief.status, 0, "cn brief exited non-zero");
  assert.ok(lines(brief.stdout).length < 20, "cn brief is 20 lines or more");
  assert.equal(cn(["brief", "--can", "decision"]).status, 0, "cn brief --can exited non-zero");
});

row("verbs/show.mts", () => {
  const issue = cn(["show", "cn-1"]);
  assert.equal(issue.status, 0, "cn show cn-1 exited non-zero");
  assert.match(issue.out, /scratch: first/);
  const epic = cn(["show", "ep-1"]);
  assert.equal(epic.status, 0, "cn show ep-1 exited non-zero");
  assert.match(epic.out, /cn-1/, "an epic does not show its open issues");
  assert.equal(cn(["show", "cn-1", "--history"]).status, 0, "cn show --history exited non-zero");
});

row("verbs/claim.mts, verbs/release.mts", () => {
  const mine = cn(["claim", "cn-2"]);
  assert.equal(mine.status, 0, "cn claim cn-2 was refused");
  assert.match(mine.out, /in_progress/);
  const theirs = cn(["claim", "cn-2"], { as: "other" });
  assert.equal(theirs.status, 1, "a second actor's claim was not refused");
  assert.match(theirs.out, /e2e\/claude/, "the refusal does not name who holds it");
  assert.equal(cn(["release", "cn-2"]).status, 0, "cn release cn-2 was refused");
  assert.equal(cn(["claim", "cn-2"]).status, 0, "cn claim after a release was refused");
});

row("verbs/update.mts", () => {
  const revision = revisionOf("cn-2");
  const args = ["update", "cn-2", "--revision", String(revision), "--priority", "1"];
  assert.equal(cn(args).status, 0, "cn update against the revision cn printed was refused");
  const stale = cn(args);
  assert.equal(stale.status, 1, "a write against a moved revision was not refused");
  assert.match(stale.out, /--revision/, "the refusal does not say how to retry");
});

row("verbs/journal.mts", () => {
  const body = "scratch: a finding";
  assert.equal(
    cn(["journal", "cn-2", "--kind", "finding", body]).status,
    0,
    "cn journal was refused",
  );
  assert.equal(json(["show", "cn-2"]).journal[0].body, body, "the entry is not shown newest first");
});

row("verbs/dep.mts", () => {
  assert.equal(cn(["dep", "add", "cn-2", "--blocked-by", "cn-1"]).status, 0, "cn dep add refused");
  assert.deepEqual(ids(json(["show", "cn-2"]).blockedBy), ["cn-1"], "cn-2 is not blocked by cn-1");
  assert.deepEqual(ids(json(["show", "cn-1"]).blocks), ["cn-2"], "cn-1 does not block cn-2");
  assert.ok(!ids(json(["ready"])).includes("cn-2"), "a blocked issue is still ready");
  assert.equal(cn(["dep", "rm", "cn-2", "--blocked-by", "cn-1"]).status, 0, "cn dep rm refused");
  assert.deepEqual(ids(json(["show", "cn-2"]).blockedBy), [], "the edge survived cn dep rm");
});

row("verbs/wait.mts", () => {
  const made = cn([
    "create",
    "--project",
    "cn",
    "--epic",
    "ep-0",
    "--title",
    "scratch: blocker round trip",
  ]);
  assert.equal(made.status, 0, "cn create into the inbox was refused");
  assert.match(made.out, /cn-4/, "the fourth issue did not mint cn-4");

  const raised = cn([
    "wait",
    "cn-4",
    "--kind",
    "decision",
    "--owner",
    "balder",
    "--title",
    "scratch",
    "--resolves",
    "the round trip is done",
  ]);
  assert.equal(raised.status, 0, "cn wait was refused");
  assert.match(raised.out, /bl-1/, "the first blocker did not mint bl-1");
  assert.ok(!ids(json(["ready"])).includes("cn-4"), "a blocked issue did not leave cn ready");
  assert.ok(ids(json(["list"])).includes("cn-4"), "a blocked issue left cn list as well");
});

row("verbs/waiting.mts", () => {
  const waiting = cn(["waiting"]);
  assert.equal(waiting.status, 0, "cn waiting exited non-zero");
  const named = lines(waiting.stdout).filter((l) => /\bbl-\d+/.test(l));
  assert.deepEqual(named.length, 1, "cn waiting is not one line per unresolved blocker");
  assert.match(named[0], /bl-1/);
  assert.equal(json(["waiting"]).length, 1, "cn waiting --json is not the one blocker");
  const shown = cn(["show", "bl-1"]);
  assert.equal(shown.status, 0, "cn show bl-1 exited non-zero");
  assert.match(shown.out, /cn-4/, "a blocker does not show what it holds");
});

row("verbs/ack.mts, verbs/resolve.mts", () => {
  assert.equal(cn(["ack", "bl-1"]).status, 1, "an agent was allowed to ack a blocker");
  assert.equal(cn(["ack", "bl-1"], { as: "human" }).status, 0, "a person's ack was refused");
  const resolved = cn(["resolve", "bl-1", "--note", "done"], { as: "human" });
  assert.equal(resolved.status, 0, "a person's resolve was refused");
  assert.ok(ids(json(["ready"])).includes("cn-4"), "the freed issue did not come back to ready");
  assert.equal(cn(["waiting"]).stdout, "", "cn waiting prints something with nothing waiting");
});

row("verbs/drop.mts", () => {
  const revision = String(revisionOf("cn-4"));
  const silent = cn(["drop", "cn-4", "--revision", revision]);
  assert.equal(silent.status, 2, "a drop with no --reason was not a usage error");
  const dropped = cn(["drop", "cn-4", "--revision", revision, "--reason", "scratch"]);
  assert.equal(dropped.status, 0, "cn drop --reason was refused");
  assert.equal(json(["show", "cn-4"]).droppedReason, "scratch", "the reason was not recorded");
});

row("verbs/close.mts", () => {
  const failed = cn(["close", "cn-1", "--revision", String(revisionOf("cn-1")), "--run", "exit 3"]);
  assert.notEqual(failed.status, 0, "a close on a command that failed was allowed");
  assert.equal(json(["show", "cn-1"]).status, "open", "the refused close closed the issue anyway");

  const closed = cn([
    "close",
    "cn-2",
    "--revision",
    String(revisionOf("cn-2")),
    "--run",
    "echo proof",
    "--follow-up",
    "scratch: follow-up",
    "--kind",
    "verify",
  ]);
  assert.equal(closed.status, 0, "cn close --run 'echo proof' was refused");
  const shown = json(["show", "cn-2"]);
  assert.equal(shown.status, "closed", "the issue is not closed");
  assert.equal(shown.verification.command, "echo proof", "the record is not the command that ran");
  assert.equal(shown.verification.exitCode, 0, "the record is not the real exit code");
  assert.match(shown.verification.output, /proof/, "the record does not carry what it wrote");
  assert.equal(shown.followUps.length, 1, "the follow-up does not exist beside the closed parent");
});

row("verbs/epic.mts (close)", () => {
  const refused = cn(["epic", "close", "ep-1", "--revision", String(revisionOf("ep-1"))]);
  assert.equal(refused.status, 1, "an epic with open work was allowed to close");
  assert.match(refused.out, /cn-1|cn-3/, "the refusal does not name what is still open");
});

row("verbs/reconcile.mts", () => {
  const made = cn(["epic", "new", "scratch: reconcile"]);
  assert.equal(made.status, 0, "cn epic new was refused");
  assert.match(made.out, /ep-2/, "the second epic did not mint ep-2");
  const twins = ["scratch: the same title", "scratch: the same title."].map((title) => {
    const created = cn(["create", "--project", "cn", "--epic", "ep-2", "--title", title]);
    assert.equal(created.status, 0, `cn create "${title}" was refused`);
    return created;
  });
  assert.equal(twins.length, 2);
  const held = ids(json(["list", "--epic", "ep-2"]));

  assert.equal(cn(["reconcile", "ep-2"]).status, 0, "cn reconcile was refused");
  const waiting = json(["waiting"]);
  assert.equal(waiting.length, 1, "reconcile did not raise exactly one blocker");
  assert.equal(waiting[0].raisedBy.name, "cairn/reconcile", "the raise is not by cairn/reconcile");
  assert.deepEqual(
    sorted(ids(waiting[0].issues)),
    sorted(held),
    "the blocker does not hold both near-identical issues",
  );

  assert.equal(cn(["reconcile", "ep-2"]).status, 0, "a second cn reconcile was refused");
  assert.equal(json(["waiting"]).length, 1, "a second cn reconcile asked the question again");

  const resolved = cn(["resolve", waiting[0].id, "--note", "scratch"], { as: "human" });
  assert.equal(resolved.status, 0, "a person's resolve was refused");
  const revision = String(revisionOf("ep-2"));
  const dropped = cn([
    "epic",
    "close",
    "ep-2",
    "--revision",
    revision,
    "--drop",
    "--reason",
    "scratch",
  ]);
  assert.equal(dropped.status, 0, "cn epic close --drop was refused");
});

row("verbs/init.mts", () => {
  const config = join(cold, "cairn", "config.json");
  const viaFile = { xdg: cold, viaConfig: true };

  // A machine with nothing configured: every verb says so, and the hook says where to go.
  const blind = cn(["doctor"], viaFile);
  assert.equal(blind.status, 1, "cn doctor passed on a machine with no deployment at all");
  assert.match(blind.out, /cn init/, "the refusal does not name the verb that fixes it");
  const asked = hook();
  assert.equal(asked.status, 0, "the hook exited non-zero with nothing configured");
  assert.match(asked.stdout, /not set up/, "the hook does not say the machine is not set up");
  assert.match(asked.stdout, /\/cairn:init/, "the hook does not point at /cairn:init");

  // The whole setup, as a person would run it, with the secret coming from a command.
  const setup = ["init", "--name", "e2e", "--url", url, "--secret-cmd", "echo s3cret"];
  const made = cn([...setup, "--can", "web", "android"], viaFile);
  assert.equal(made.status, 0, "cn init was refused against a deployment that answers");
  assert.ok(!made.out.includes("s3cret"), "cn init printed the secret it was given");
  assert.equal(statSync(config).mode & 0o777, 0o600, "the config is not mode 600");
  assert.deepEqual(JSON.parse(readFileSync(config, "utf8")), {
    default: "e2e",
    can: ["web", "android"],
    deployments: { e2e: { url, secret: "s3cret" } },
  });

  // The file alone is enough from here: nothing in the environment names a deployment.
  const doctored = cn(["doctor"], viaFile);
  assert.equal(doctored.status, 0, "cn doctor failed on the config cn init just wrote");
  assert.match(doctored.out, /e2e/, "cn doctor does not name the deployment it resolved");
  assert.match(doctored.out, /from config/, "cn doctor does not name the config as the source");

  const written = readFileSync(config, "utf8");
  const again = cn([...setup, "--can", "web", "android"], viaFile);
  assert.equal(again.status, 1, "cn init replaced a deployment that was already there");
  assert.match(again.out, /already a deployment/, "the refusal does not say the name is taken");
  assert.equal(readFileSync(config, "utf8"), written, "the refused cn init wrote anyway");

  const second = cn(["init", "--name", "other", "--url", url], viaFile);
  assert.equal(second.status, 0, "a second deployment was refused");
  const both = JSON.parse(readFileSync(config, "utf8"));
  assert.deepEqual(sorted(Object.keys(both.deployments)), ["e2e", "other"], "both are not there");
  assert.equal(both.default, "e2e", "a second deployment took the default without --default");
  assert.deepEqual(both.can, ["web", "android"], "a second deployment rewrote can");
  assert.ok(!("secret" in both.deployments.other), "a deployment with no secret got a secret key");

  const dead = cn(["init", "--name", "dead", "--url", "http://127.0.0.1:9"], viaFile);
  assert.equal(dead.status, 1, "cn init against a deployment that does not answer was allowed");
  assert.match(dead.out, /nothing written/, "the refusal does not say nothing was written");
  assert.ok(!readFileSync(config, "utf8").includes("dead"), "a failed check was written anyway");

  // The second acceptance criterion: the first session after setup opens with the brief.
  const warm = hook();
  assert.equal(warm.status, 0, "the hook exited non-zero with a deployment configured");
  assert.ok(!warm.stdout.includes("/cairn:init"), "the hook still asks for setup after cn init");
  assert.match(warm.stdout, /e2e/, "the brief does not name the deployment");
  assert.match(warm.stdout, /can web android/, "the brief does not carry what the config said");
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
        console.error(`  cn ${last.args.join(" ")}`);
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
