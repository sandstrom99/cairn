// clouds.mjs: the cloud deployments this checkout keeps, and which of them a command runs against.
//
//   cloudFiles(dir)                     every `backend/.env.cloud.<name>.local`, by name
//   pickClouds({ dir, name, one })      the deployments a command runs against, or why none
//
// One checkout serves every company whose worklist it pushes, one deployment each, and a
// backend change has to reach each of them: a function that lands on one company's
// deployment and not another's leaves the second running code the first has moved past.
// So each deployment has its own gitignored env file, named as `cn init` names the
// deployment, and a command that pushes runs against all of them unless one is named. A
// command that holds one deployment open or changes its secret, the watcher and
// `secret.mjs`, runs against exactly one, and with several and none named it refuses
// rather than guess.
//
// `backend/.env.cloud.local` was the one file before there were several. It is refused
// even beside new ones, since a checkout holding it has a deployment no command would
// reach and nothing would say so.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { deploymentIn, packageRoot } from "./run-convex.mjs";

/** The one cloud file a checkout held before it could keep several. */
export const OLD_FILE = ".env.cloud.local";

/** A cloud file's name, its deployment's name as `cn init` gives it in the middle. */
const CLOUD_FILE = /^\.env\.cloud\.([a-z0-9][a-z0-9-]*)\.local$/;

/** Every cloud file in `dir`, as { name, envFile } sorted by name; `envFile` is the bare file name. */
export function cloudFiles(dir = packageRoot) {
  return readdirSync(dir)
    .map((envFile) => ({ envFile, match: CLOUD_FILE.exec(envFile) }))
    .filter(({ match }) => match !== null)
    .map(({ envFile, match }) => ({ name: match[1], envFile }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * The deployments a command runs against: `{ targets }`, each
 * `{ name, envFile, file, deployment }` (`file` absolute, `deployment` its CONVEX_DEPLOYMENT),
 * or `{ code, message }` when it runs against none. `one` is for a command that runs
 * against exactly one.
 *
 * @param {{ dir?: string, name?: string, one?: boolean }} [options]
 * @returns {{ targets: { name: string, envFile: string, file: string, deployment: string }[] } | { code: 1 | 2, message: string }}
 */
export function pickClouds({ dir = packageRoot, name, one = false } = {}) {
  if (existsSync(join(dir, OLD_FILE))) {
    return {
      code: 1,
      message:
        "backend/.env.cloud.local is the old name: rename it to backend/.env.cloud.<name>.local, <name> as cn init names the deployment",
    };
  }
  const files = cloudFiles(dir);
  if (files.length === 0) {
    return {
      code: 1,
      message:
        "no cloud deployment in backend/: backend/.env.cloud.<name>.local names one, <name> as cn init names it",
    };
  }
  const names = files.map((f) => f.name);
  let chosen;
  if (name !== undefined) {
    chosen = files.filter((f) => f.name === name);
    if (chosen.length === 0) {
      return {
        code: 2,
        message: `no cloud deployment named ${name}: backend/ has ${names.join(", ")}`,
      };
    }
  } else if (files.length > 1 && one) {
    return { code: 2, message: `name the deployment: backend/ has ${names.join(", ")}` };
  } else {
    chosen = files;
  }

  // Every target is read before any runs, so a push over several cannot land on the first
  // and then find the second names nothing.
  const targets = [];
  for (const { name: each, envFile } of chosen) {
    const file = join(dir, envFile);
    const deployment = deploymentIn(file);
    if (deployment === undefined) {
      return { code: 1, message: `backend/${envFile} names no CONVEX_DEPLOYMENT` };
    }
    targets.push({ name: each, envFile, file, deployment });
  }
  return { targets };
}
