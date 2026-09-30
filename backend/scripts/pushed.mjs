// pushed.mjs: the commit a deployment's functions came from, and the name they were pushed
// under, recorded on the deployment.
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
// Beside it the push records `CAIRN_NAME`, the name it pushed under: the `<name>` of
// `backend/.env.cloud.<name>.local`, which is what `cn init --name` called the deployment on
// each machine, and what the page's rail and tab title read (`backend/convex/deployment.ts`).
// A deployment the push never reached, the anonymous local one and a throwaway among them,
// has neither.
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

const PUSHED_KEY = "CAIRN_PUSHED_FROM";
const NAME_KEY = "CAIRN_NAME";

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
 * Sets `CAIRN_PUSHED_FROM` to `value` on the deployment `env` and `cwd` reach, and
 * `CAIRN_NAME` to `name` when one is given, leaving it as it is when not. Returns the first
 * convex exit status that is not 0, or 0. Convex's own lines are held back unless it failed.
 */
export function recordPush({ value, name, env = process.env, cwd = packageRoot }) {
  const set = (key, input) => {
    const result = convexSync(["env", "set", key], { cwd, env, input });
    if (result.status !== 0) process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    return result.status ?? 1;
  };
  const status = set(PUSHED_KEY, value);
  if (status !== 0 || name === undefined) return status;
  return set(NAME_KEY, name);
}
