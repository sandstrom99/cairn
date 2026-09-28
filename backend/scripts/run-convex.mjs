// run-convex.mjs: the one way this package starts `convex`. `local.mjs`, `cloud.mjs` and
// `throwaway.mjs` each decide which deployment and which environment; this is the spawn
// they share, the signals it forwards and the exit status it maps.
//
//   spawnConvex(args, options)   the child, for a caller that owns its lifetime
//   runConvex(args, options)     the child in the foreground, this process's exit status
//   deploymentIn(file)           the CONVEX_DEPLOYMENT an env file names
//
// It runs the package's own `node_modules/convex/bin/main.js` under this node rather than
// `npx convex`, so every wrapper starts the same binary the same way, whatever is on PATH
// and whichever directory it runs from: the throwaway runs it from a mirror directory.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** `backend/`, whichever directory the caller was started from. */
export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** The file convex 1.46 saves the deployment it last talked to into. */
export const envLocal = join(packageRoot, ".env.local");

const CONVEX_BIN = join(packageRoot, "node_modules", "convex", "bin", "main.js");

/**
 * Starts `convex <args>` and returns the child. `env` replaces the environment rather than
 * adding to it, so a caller that must not inherit a deployment builds its own.
 */
export function spawnConvex(
  args,
  { cwd = packageRoot, env = process.env, detached = false, stdio = "inherit" } = {},
) {
  return spawn(process.execPath, [CONVEX_BIN, ...args], { cwd, env, detached, stdio });
}

/**
 * Runs `convex <args>` in the foreground. SIGINT and SIGTERM go to the child, so Ctrl-C
 * on a watcher reaches convex and it stops its own backend rather than leaving it holding
 * its port. The exit status is convex's, or 1 when a signal ended it. A convex that cannot
 * start at all, a missing binary say, is one line and exit 1 rather than a stack. `after`
 * runs only once convex has exited 0, and its status becomes this process's; `onExit` runs
 * last, whichever way the child ends.
 */
export function runConvex(args, { env, after, onExit = () => {} } = {}) {
  const child = spawnConvex(args, { env });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", (e) => {
    console.error(`convex did not start: ${e.message}`);
    onExit();
    process.exit(1);
  });
  child.on("exit", async (code, signal) => {
    let status = code ?? (signal ? 1 : 0);
    try {
      if (status === 0 && after) status = await after();
    } catch (e) {
      console.error(e.message);
      status = 1;
    }
    onExit();
    process.exit(status);
  });
}

/**
 * The `CONVEX_DEPLOYMENT` an env file names, or undefined with no file or no such line.
 * The line is the binding; the header convex writes above it changes from release to
 * release and means nothing.
 */
export function deploymentIn(file) {
  if (!existsSync(file)) return undefined;
  const match = readFileSync(file, "utf8").match(
    /^\s*CONVEX_DEPLOYMENT\s*=\s*["']?([^"'\r\n]*?)["']?\s*$/m,
  );
  return match?.[1] || undefined;
}
