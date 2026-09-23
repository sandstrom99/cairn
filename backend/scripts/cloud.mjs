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
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { envLocal, runConvex } from "./run-convex.mjs";

/** The file's bytes, or null when there is no file to put back. */
const saved = existsSync(envLocal) ? readFileSync(envLocal) : null;

const restore = () => {
  if (saved !== null) writeFileSync(envLocal, saved);
  else if (existsSync(envLocal)) rmSync(envLocal);
};

runConvex(["dev", "--env-file", ".env.cloud.local", ...process.argv.slice(2)], {
  onExit: restore,
});
