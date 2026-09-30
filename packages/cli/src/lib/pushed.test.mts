import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Deployment } from "./config.mts";
import {
  checkoutRoot,
  functionsCheck,
  isMissingFunction,
  mismatchLine,
  pushFix,
} from "./pushed.mts";

const cloud: Deployment = {
  name: "cairn",
  url: "https://tidy-otter-1.convex.cloud",
  source: "default",
};
const local: Deployment = { name: "CAIRN_URL", url: "http://127.0.0.1:3210", source: "CAIRN_URL" };
const PUSH = "vp run -F @cairn/backend push:cloud -- cairn";

// What ConvexHttpClient threw, verbatim, calling a throwaway deployment on 2026-09-29.
const VALIDATOR =
  "v.object({history: v.optional(v.boolean()), id: v.string(), journal: v.optional(v.float64()), now: v.optional(v.float64()), secret: v.optional(v.string())})";
/** `show:get` with an argument it does not take. */
const EXTRA = `[Request ID: 0749d64b8b339704] Server Error\nArgumentValidationError: Object contains extra field \`bogus\` that is not in the validator.\n\nObject: {bogus: 1.0, id: "cn-1"}\nValidator: ${VALIDATOR}\n\n`;
/** `show:get` without the argument it needs. */
const NEEDS = `[Request ID: 7eb5da593147fe2c] Server Error\nArgumentValidationError: Object is missing the required field \`id\`. Consider wrapping the field validator in \`v.optional(...)\` if this is expected.\n\nObject: {}\nValidator: ${VALIDATOR}\n\n`;
/** `projects:create`, a mutation, with an argument it does not take: no prefix names either kind. */
const EXTRA_MUTATION =
  '[Request ID: aea44f8d33415185] Server Error\nArgumentValidationError: Object contains extra field `bogus` that is not in the validator.\n\nObject: {actor: {kind: "agent", name: "a/b"}, bogus: 1.0, name: "X", slug: "x"}\nValidator: v.object({actor: v.object({kind: v.union(v.literal("human"), v.literal("agent")), name: v.string(), session: v.optional(v.string())}), name: v.string(), secret: v.optional(v.string()), slug: v.string()})\n\n';
/** A function the deployment does not have, the same for a query and a mutation. */
const NO_FUNCTION =
  "[Request ID: c01a32a7928c94d8] Server Error\nCould not find public function for 'nope:missing'.\n";

/** `git <args>` in `dir`, as a throwaway identity, its stdout trimmed. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync(
    "git",
    ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();

/** Writes `text` at `path` under `dir` and commits it as `message`, returning the commit. */
function commit(dir: string, path: string, text: string, message: string): string {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

const dirs: string[] = [];
const temp = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

/** A checkout at `tests`, and one behind it at `base`. */
let repo: string;
let behind: string;
let base: string;
let changed: string;
let tests: string;
let side: string;

beforeAll(() => {
  repo = temp("cairn-pushed-");
  git(repo, "init", "-q", "-b", "main");
  base = commit(repo, "backend/convex/a.ts", "export const a = 1;\n", "base");
  git(repo, "checkout", "-q", "-b", "side");
  side = commit(repo, "backend/convex/a.ts", "export const a = 3;\n", "side");
  git(repo, "checkout", "-q", "main");
  changed = commit(repo, "backend/convex/a.ts", "export const a = 2;\n", "a function changed");
  tests = commit(repo, "backend/convex/tests/a.test.ts", "// a test\n", "a test changed");

  behind = join(temp("cairn-pushed-behind-"), "clone");
  execFileSync("git", ["clone", "-q", repo, behind], { stdio: "ignore" });
  git(behind, "checkout", "-q", "--detach", base);
});

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const short = (commit: string): string => commit.slice(0, 7);

describe("checkoutRoot", () => {
  it("is the repository cn runs from, with no trailing slash", () => {
    expect(existsSync(join(checkoutRoot(), "AGENTS.md"))).toBe(true);
    expect(checkoutRoot().endsWith("/")).toBe(false);
  });
});

describe("pushFix", () => {
  it("names the deployment to push, or its URL where CAIRN_URL chose it", () => {
    expect(pushFix(cloud)).toBe(PUSH);
    expect(pushFix({ ...cloud, name: "northwind", source: "CAIRN_DEPLOYMENT" })).toBe(
      "vp run -F @cairn/backend push:cloud -- northwind",
    );
    expect(pushFix(local)).toBe("push this checkout's functions to http://127.0.0.1:3210");
  });
});

describe("functionsCheck", () => {
  it("passes a deployment pushed from the commit this cn runs from", () => {
    expect(functionsCheck(cloud, tests, repo)).toEqual({
      check: "functions",
      ok: true,
      line: `functions on cairn pushed from ${short(tests)}, the same as this cn's`,
    });
  });

  it("reads a commit whose functions match as the same, whatever changed under tests/", () => {
    expect(functionsCheck(cloud, changed, repo)).toMatchObject({
      ok: true,
      line: `functions on cairn pushed from ${short(changed)}, the same as this cn's`,
    });
  });

  it("names an older deployment and the push that fixes it", () => {
    expect(functionsCheck(cloud, base, repo)).toMatchObject({
      ok: false,
      line: `cairn runs functions from ${short(base)}, older than this cn's ${short(tests)}: ${PUSH}`,
    });
  });

  it("names a newer deployment and the pull that fixes it", () => {
    expect(functionsCheck(cloud, changed, behind)).toMatchObject({
      ok: false,
      line: `cairn runs functions from ${short(changed)}, newer than this cn's ${short(base)}: git -C ${behind} pull --ff-only`,
    });
  });

  it("names a deployment pushed from another branch, and a push from main", () => {
    expect(functionsCheck(cloud, side, repo)).toMatchObject({
      ok: false,
      line: `cairn runs functions from ${short(side)}, on another branch than this cn's ${short(tests)}: ${PUSH} from a checkout at main`,
    });
  });

  it("names a commit this checkout has not fetched, and the pull that fetches it", () => {
    expect(functionsCheck(cloud, "0".repeat(40), repo)).toMatchObject({
      ok: false,
      line: `cairn runs functions from 0000000, a commit this checkout has not fetched: git -C ${repo} pull --ff-only, then cn doctor again`,
    });
  });

  it("refuses a record that is not a commit before git ever reads it", () => {
    for (const recorded of ["--output=/tmp/x", "main", `${"0".repeat(39)}g`])
      expect(functionsCheck(cloud, recorded, repo)).toEqual({
        check: "functions",
        ok: false,
        line: `functions on cairn recorded as "${recorded}", not a commit: vp run -F @cairn/backend push:cloud -- cairn`,
      });
  });

  it("does not compare functions pushed with uncommitted changes", () => {
    expect(functionsCheck(cloud, `${base}-dirty`, repo)).toEqual({
      check: "functions",
      ok: true,
      line: `functions on cairn pushed from ${short(base)} with uncommitted changes, so not compared`,
    });
  });

  it("passes a deployment nothing recorded on, and fails one without the function", () => {
    expect(functionsCheck(cloud, null, repo)).toEqual({
      check: "functions",
      ok: true,
      line: "functions on cairn not recorded: only #push:cloud records them",
    });
    expect(functionsCheck(cloud, "missing", repo)).toEqual({
      check: "functions",
      ok: false,
      line: `cairn runs functions older than this cn: ${PUSH}`,
    });
  });

  it("does not compare from a cn that is not a git checkout", () => {
    const plain = temp("cairn-pushed-plain-");
    expect(functionsCheck(cloud, tests, plain)).toMatchObject({
      ok: true,
      line: `functions on cairn pushed from ${short(tests)}; this cn is not a git checkout, so not compared`,
    });
  });

  it("names a deployment CAIRN_URL chose by its URL, never by that name", () => {
    expect(functionsCheck(local, "missing", repo).line).toBe(
      "the deployment at http://127.0.0.1:3210 runs functions older than this cn: push this checkout's functions to http://127.0.0.1:3210",
    );
    expect(functionsCheck(local, base, repo).line).toBe(
      `the deployment at http://127.0.0.1:3210 runs functions from ${short(base)}, older than this cn's ${short(tests)}: push this checkout's functions to http://127.0.0.1:3210`,
    );
  });
});

describe("mismatchLine", () => {
  it("reads an argument the deployment does not take as older functions", () => {
    expect(mismatchLine(EXTRA, cloud, "/src/cairn", "show:get")).toBe(
      `cairn runs older functions than this cn (show:get has no \`bogus\`): ${PUSH}`,
    );
    expect(mismatchLine(EXTRA_MUTATION, cloud, "/src/cairn", "projects:create")).toBe(
      `cairn runs older functions than this cn (projects:create has no \`bogus\`): ${PUSH}`,
    );
  });

  it("reads a function the deployment does not have as older functions", () => {
    expect(mismatchLine(NO_FUNCTION, cloud, "/src/cairn", "nope:missing")).toBe(
      `cairn runs older functions than this cn (no nope:missing): ${PUSH}`,
    );
    expect(isMissingFunction(NO_FUNCTION)).toBe(true);
    expect(isMissingFunction(EXTRA)).toBe(false);
  });

  it("reads an argument the deployment needs and cn does not send as newer functions", () => {
    expect(mismatchLine(NEEDS, cloud, "/src/cairn", "show:get")).toBe(
      "cairn runs newer functions than this cn (show:get needs `id`): git -C /src/cairn pull --ff-only",
    );
  });

  it("reads any other argument error as a disagreement doctor can place", () => {
    const other =
      "[Request ID: 1] Server Error\nArgumentValidationError: Value does not match validator.\nPath: .id\nValue: 1.0\nValidator: v.string()\n\n";
    expect(mismatchLine(other, cloud, "/src/cairn", "show:get")).toBe(
      "cairn and this cn disagree on show:get's arguments: cn doctor says which is behind",
    );
  });

  it("is null for anything else", () => {
    expect(mismatchLine("fetch failed", cloud, "/src/cairn", "show:get")).toBeNull();
    expect(
      mismatchLine("[Request ID: 2] Server Error\nUncaught Error: boom\n", cloud, "/", "a:b"),
    ).toBeNull();
  });

  it("names a deployment CAIRN_URL chose by its URL, and never echoes the arguments", () => {
    const line = mismatchLine(EXTRA, local, "/src/cairn", "show:get");
    expect(line).toBe(
      "the deployment at http://127.0.0.1:3210 runs older functions than this cn (show:get has no `bogus`): push this checkout's functions to http://127.0.0.1:3210",
    );
    for (const message of [EXTRA, NEEDS, EXTRA_MUTATION, NO_FUNCTION])
      expect(mismatchLine(message, cloud, "/", "show:get")).not.toMatch(/Object:|cn-1|Validator/);
  });
});
