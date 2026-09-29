// run-convex.mjs: the one way this package starts `convex`. `local.mjs`, `cloud.mjs`,
// `throwaway.mjs` and `secret.mjs` each decide which deployment and which environment;
// this is the spawn they share, the signals it forwards and the exit status it maps.
//
//   spawnConvex(args, options)   the child, for a caller that owns its lifetime
//   runConvex(args, options)     the child in the foreground, this process's exit status
//   convexStatus(args, options)  the child in the foreground, its exit status resolved
//   convexSync(args, options)    the child run to its end, its output captured
//   holdEnvLocal()               `.env.local`'s bytes now, and the function that puts them back
//   valueIn(file, name)          the value an env file gives a name
//   deploymentIn(file)           the CONVEX_DEPLOYMENT an env file names
//
// It runs the package's own `node_modules/convex/bin/main.js` under this node rather than
// `npx convex`, so every wrapper starts the same binary the same way, whatever is on PATH
// and whichever directory it runs from: the throwaway runs it from a mirror directory.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
 * Runs `convex <args>` to its end and returns what `spawnSync` did, both streams piped and
 * read as UTF-8, for a caller that needs convex's output rather than its terminal. `input`
 * is what convex reads on stdin; with it, convex sees no terminal there.
 */
export function convexSync(args, { cwd = packageRoot, env = process.env, input } = {}) {
  return spawnSync(process.execPath, [CONVEX_BIN, ...args], { cwd, env, input, encoding: "utf8" });
}

/**
 * Reads `.env.local`'s bytes now, or notes that there is no file, and returns the function
 * that writes them back exactly, or removes the file when there was none. convex 1.46
 * writes the deployment it talked to into `.env.local` whatever `--env-file` says;
 * `cloud.mjs` says why that binding has to survive.
 */
export function holdEnvLocal() {
  const saved = existsSync(envLocal) ? readFileSync(envLocal) : null;
  return () => {
    if (saved !== null) writeFileSync(envLocal, saved);
    else if (existsSync(envLocal)) rmSync(envLocal);
  };
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
 * Runs `convex <args>` in the foreground and resolves with its exit status — 1 when a
 * signal ended it or it could not start — leaving this process running, for a caller that
 * runs convex more than once, which runConvex's process.exit cannot serve. SIGINT and
 * SIGTERM reach the child while it runs.
 *
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<number>}
 */
export function convexStatus(args, { env } = {}) {
  return new Promise((resolve) => {
    const child = spawnConvex(args, { env });
    const forwarders = ["SIGINT", "SIGTERM"].map((signal) => {
      const forward = () => child.kill(signal);
      process.on(signal, forward);
      return [signal, forward];
    });
    let done = false;
    const finish = (status) => {
      if (done) return;
      done = true;
      for (const [signal, forward] of forwarders) process.off(signal, forward);
      resolve(status);
    };
    child.on("error", (e) => {
      console.error(`convex did not start: ${e.message}`);
      finish(1);
    });
    child.on("exit", (code, signal) => finish(code ?? (signal ? 1 : 0)));
  });
}

/**
 * The value an env file gives `name`, or undefined with no file, no such line or an empty
 * value. The line is what counts; the header convex writes above it changes from release
 * to release and means nothing.
 */
export function valueIn(file, name) {
  if (!existsSync(file)) return undefined;
  const match = readFileSync(file, "utf8").match(
    new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\\r\\n]*?)["']?\\s*$`, "m"),
  );
  return match?.[1] || undefined;
}

/** The `CONVEX_DEPLOYMENT` an env file names, or undefined with no file or no such line. */
export function deploymentIn(file) {
  return valueIn(file, "CONVEX_DEPLOYMENT");
}
