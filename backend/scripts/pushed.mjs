// pushed.mjs: the commit a deployment's functions came from, recorded on the deployment.
//
//   import { pushedFrom, recordPush } from "./pushed.mjs"   `cloud.mjs` after the functions
//                                                          land, and the e2e row against
//                                                          its throwaway
//
// `#push:cloud` pushes whatever `backend/convex` holds, and a `cn` elsewhere calls those
// functions by name with the arguments its own checkout knows. When the two drift, a verb
// fails with Convex's validator error and nothing says which side is behind. So each push
// records `CAIRN_PUSHED_FROM` on the deployment it reached, `backend/convex/deployment.ts`
// hands it back, and `cn doctor` compares it with the commit `cn` runs from.
//
// The value is `git rev-parse HEAD`, with `-dirty` after it when `convex/` carries changes
// no commit holds, since then no commit names what was pushed. Outside a git checkout there
// is nothing to name, and the caller says so instead of recording anything.
//
// The record is set the way `secret.mjs` sets the secret, `convex env set` with the value
// on stdin, in the directory and the environment a `convex` command there runs with:
// `backend/` and the cloud's `CONVEX_DEPLOYMENT` for `#push:cloud`, the throwaway's mirror
// and its environment for the e2e row.
import { execFileSync } from "node:child_process";
import { convexSync, packageRoot } from "./run-convex.mjs";

const NAME = "CAIRN_PUSHED_FROM";

/** The commit `cwd`'s functions are, `-dirty` after it when `convex/` has changes; null outside git. */
export function pushedFrom({ cwd = packageRoot } = {}) {
  const git = (args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    const head = git(["rev-parse", "HEAD"]).trim();
    const dirty = git(["status", "--porcelain", "--", "convex"]).trim() !== "";
    return dirty ? `${head}-dirty` : head;
  } catch {
    return null;
  }
}

/**
 * Sets `CAIRN_PUSHED_FROM` to `value` on the deployment `env` and `cwd` reach, and returns
 * convex's exit status. Convex's own lines are held back unless it failed.
 */
export function recordPush({ value, env = process.env, cwd = packageRoot }) {
  const set = convexSync(["env", "set", NAME], { cwd, env, input: value });
  if (set.status !== 0) process.stderr.write(`${set.stdout ?? ""}${set.stderr ?? ""}`);
  return set.status ?? 1;
}
