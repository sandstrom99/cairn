// cloud.mjs: `convex dev` against the cloud deployment, with `.env.local` left alone.
//
//   node scripts/cloud.mjs            the watcher              (#dev:cloud)
//   node scripts/cloud.mjs --once     one push, then the page  (#push:cloud)
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
//
// A push that landed ships the page after it (scripts/page.mjs), so the functions and the
// page they serve at `https://<name>.convex.site` go out in one command and cannot drift.
// The upload names the cloud deployment in its environment, which convex takes over any
// file, so it reaches the cloud whatever `.env.local` says in the meantime. The watcher
// ships no page: `vp run dev:web` is the loop for the page, and the watcher's is the
// functions'.
import { join } from "node:path";
import { shipPage } from "./page.mjs";
import { deploymentIn, holdEnvLocal, packageRoot, runConvex } from "./run-convex.mjs";

const ENV_CLOUD = ".env.cloud.local";

const restore = holdEnvLocal();

const args = process.argv.slice(2);

/** The page for the deployment the push just reached, named rather than read from `.env.local`. */
const page = async () => {
  const deployment = deploymentIn(join(packageRoot, ENV_CLOUD));
  if (deployment === undefined) throw new Error(`${ENV_CLOUD} names no CONVEX_DEPLOYMENT`);
  const { status } = await shipPage({ env: { ...process.env, CONVEX_DEPLOYMENT: deployment } });
  return status;
};

runConvex(["dev", "--env-file", ENV_CLOUD, ...args], {
  after: args.includes("--once") ? page : undefined,
  onExit: restore,
});
