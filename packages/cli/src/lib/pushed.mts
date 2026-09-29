// pushed.mts: whether a deployment runs the functions this cn was written against.
//
//   import { functionsCheck, mismatchLine } from "../lib/pushed.mts";
//
// cn calls a deployment's functions by name, with the arguments its own checkout's
// generated `api` knows. `#push:cloud` puts a checkout's functions on a deployment, and
// nothing else does, so a cn at one commit can call a deployment pushed from another:
// a verb whose function gained an argument is refused by the older deployment, and one
// calling a function the deployment never got finds nothing. Convex says either in a
// validator's multi-line error that names neither side.
//
// Two answers here. `functionsCheck` is `cn doctor`'s last line: the commit
// `#push:cloud` recorded on the deployment (`deployment.pushedFrom`, from
// backend/scripts/pushed.mjs) against this checkout's HEAD, read with git, so it says
// which side is behind and the one command that fixes it. It compares commits, never the
// working tree, so uncommitted edits in a development clone do not move the answer, and
// only `backend/convex` outside its tests, since nothing else reaches the deployment.
// `mismatchLine` is the same diagnosis read off one failed call, for the client to throw
// in place of Convex's error: which side is behind as far as the error says, and the fix.
// Neither ever echoes the `Object:` dump a validator error carries, since `secret` is an
// argument on every call.
//
// A deployment named by CAIRN_URL has no name: its config name is the literal
// `CAIRN_URL`, so it is named by its URL, and a push command cannot name it.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Deployment } from "./config.mts";

/** One of `cn doctor`'s checks, here so that lib/ never imports from verbs/. */
export type Check = {
  check: "node" | "api" | "deployment" | "page" | "actor" | "can" | "ping" | "secret" | "functions";
  ok: boolean;
  line: string;
};

/** The repository cn runs from: this file is packages/cli/src/lib/pushed.mts under it. */
export const checkoutRoot = (): string =>
  resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

/** How a line names the deployment: its config name, or its URL where CAIRN_URL chose it. */
export const label = (dep: Deployment): string =>
  dep.source === "CAIRN_URL" ? `the deployment at ${dep.url}` : dep.name;

/** The one command that puts this checkout's functions on the deployment. */
export const pushFix = (dep: Deployment): string =>
  dep.source === "CAIRN_URL"
    ? `push this checkout's functions to ${dep.url}`
    : `vp run @cairn/backend#push:cloud -- ${dep.name}`;

/** Convex's words for a call to a function the deployment does not have. */
const MISSING_FUNCTION = /Could not find public function for '([^']+)'/;

/** What `#push:cloud` records: a SHA-1 or SHA-256 commit, `-dirty` after it or not. */
const COMMIT = /^[0-9a-f]{40}([0-9a-f]{24})?(-dirty)?$/;

/** True when `message` is Convex saying the deployment has no such function. */
export const isMissingFunction = (message: string): boolean => MISSING_FUNCTION.test(message);

/** `git -C root <args>`, its exit status, and its stdout trimmed. */
function git(root: string, args: string[]): { ok: boolean; out: string } {
  const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return { ok: run.status === 0, out: (run.stdout ?? "").trim() };
}

/**
 * The functions line: `recorded` is what `deployment.pushedFrom` answered, or `"missing"`
 * when the deployment has no such function, which no commit can be spelled as, and `root`
 * the checkout to compare it with.
 */
export function functionsCheck(dep: Deployment, recorded: string | null, root: string): Check {
  const L = label(dep);
  const check = (ok: boolean, line: string): Check => ({ check: "functions", ok, line });
  if (recorded === "missing")
    return check(false, `${L} runs functions older than this cn: ${pushFix(dep)}`);
  if (recorded === null)
    return check(true, `functions on ${L} not recorded: only #push:cloud records them`);
  // The record reaches git as an argument, so anything but a commit, one that opens with
  // `--` above all, stops here rather than being read as an option.
  if (!COMMIT.test(recorded))
    return check(
      false,
      `functions on ${L} recorded as "${recorded}", not a commit: ${pushFix(dep)}`,
    );

  const c7 = recorded.slice(0, 7);
  if (recorded.endsWith("-dirty"))
    return check(
      true,
      `functions on ${L} pushed from ${c7} with uncommitted changes, so not compared`,
    );

  const head = git(root, ["rev-parse", "HEAD"]);
  if (!head.ok)
    return check(
      true,
      `functions on ${L} pushed from ${c7}; this cn is not a git checkout, so not compared`,
    );
  if (!git(root, ["cat-file", "-e", `${recorded}^{commit}`]).ok)
    return check(
      false,
      `${L} runs functions from ${c7}, a commit this checkout has not fetched: git -C ${root} pull --ff-only, then cn doctor again`,
    );

  const functions = ["--", "backend/convex", ":(exclude)backend/convex/tests"];
  if (git(root, ["diff", "--quiet", recorded, "HEAD", ...functions]).ok)
    return check(true, `functions on ${L} pushed from ${c7}, the same as this cn's`);

  const h7 = head.out.slice(0, 7);
  if (git(root, ["merge-base", "--is-ancestor", recorded, "HEAD"]).ok)
    return check(
      false,
      `${L} runs functions from ${c7}, older than this cn's ${h7}: ${pushFix(dep)}`,
    );
  if (git(root, ["merge-base", "--is-ancestor", "HEAD", recorded]).ok)
    return check(
      false,
      `${L} runs functions from ${c7}, newer than this cn's ${h7}: git -C ${root} pull --ff-only`,
    );
  return check(
    false,
    `${L} runs functions from ${c7}, on another branch than this cn's ${h7}: ${pushFix(dep)} from a checkout at main`,
  );
}

/**
 * The one line for a Convex error that means the deployment and this cn were written
 * against different functions, or null for any other error. `fn` is the function called,
 * `show:get`, which the HTTP client's message does not carry.
 */
export function mismatchLine(
  message: string,
  dep: Deployment,
  root: string,
  fn: string,
): string | null {
  const L = label(dep);
  const missing = message.match(MISSING_FUNCTION);
  if (missing) return `${L} runs older functions than this cn (no ${missing[1]}): ${pushFix(dep)}`;
  if (!message.includes("ArgumentValidationError")) return null;
  const extra = message.match(/Object contains extra field `([^`]+)`/);
  if (extra)
    return `${L} runs older functions than this cn (${fn} has no \`${extra[1]}\`): ${pushFix(dep)}`;
  const needed = message.match(/Object is missing the required field `([^`]+)`/);
  if (needed)
    return `${L} runs newer functions than this cn (${fn} needs \`${needed[1]}\`): git -C ${root} pull --ff-only`;
  return `${L} and this cn disagree on ${fn}'s arguments: cn doctor says which is behind`;
}
