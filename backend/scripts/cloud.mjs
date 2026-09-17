// cloud.mjs: `convex dev` against the cloud deployment, with `.env.local` left alone.
//
//   node scripts/cloud.mjs            the watcher  (#dev:cloud)
//   node scripts/cloud.mjs --once     one push     (#push:cloud)
//
// convex 1.46 saves the deployment it just talked to into `.env.local` — its name, its
// client URL and its HTTP actions URL — whatever `--env-file` says, because the write-back
// target is hardcoded rather than taken from the flag. So a bare cloud push silently
// rebinds this checkout to the cloud deployment.
//
// That binding has to survive: `#verify`, `#dev` and the Convex MCP server in `.mcp.json`
// all read `.env.local`, and none of them says which deployment it reached. This wrapper
// holds the file's bytes, runs the push, and writes them back exactly as they were when
// the child exits, however it exits.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const envLocal = join(packageRoot, ".env.local");

/** The file's bytes, or null when there is no file to put back. */
const saved = existsSync(envLocal) ? readFileSync(envLocal) : null;

const restore = () => {
  if (saved !== null) writeFileSync(envLocal, saved);
  else if (existsSync(envLocal)) rmSync(envLocal);
};

const child = spawn(
  "npx",
  ["convex", "dev", "--env-file", ".env.cloud.local", ...process.argv.slice(2)],
  { cwd: packageRoot, stdio: "inherit" },
);

// The watcher is the case that matters: Ctrl-C reaches this process, and the child has to
// be asked to stop so its exit is what restores the file.
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

child.on("exit", (code, signal) => {
  restore();
  process.exit(code ?? (signal ? 1 : 0));
});
