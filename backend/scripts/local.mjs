// local.mjs: every `convex` command against the anonymous local deployment.
//
//   node scripts/local.mjs dev          the watcher   (#dev, #dev:local)
//   node scripts/local.mjs dev --once   one push      (#verify)
//   node scripts/local.mjs codegen      the generated code (#codegen)
//
// It heals `backend/.env.local` and then ignores it. convex 1.46 saves the deployment it
// just talked to into that file — its name and both URLs — whatever `--env-file` says, so
// anything that reaches the cloud deployment rebinds this checkout on the way past.
// `scripts/cloud.mjs` puts the file back after itself; a bare `npx convex` in `backend/`
// is the one path left that can flip it, and the next command through here corrects it.
//
// The child also carries `CONVEX_DEPLOYMENT` in its environment, which convex takes over
// the file, so a push here goes to the local deployment even while the file is wrong.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEPLOYMENT = "anonymous:anonymous-agent";

/** What `backend/.env.local` says when this checkout is bound to the local deployment. */
const LOCAL_ENV = `# Deployment used by \`npx convex dev\`
CONVEX_DEPLOYMENT=${DEPLOYMENT}

CONVEX_URL=http://127.0.0.1:3210

CONVEX_SITE_URL=http://127.0.0.1:3211
`;

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const envLocal = join(packageRoot, ".env.local");

if (!existsSync(envLocal) || readFileSync(envLocal, "utf8") !== LOCAL_ENV) {
  writeFileSync(envLocal, LOCAL_ENV);
  console.error(
    "· put the local binding back in backend/.env.local: something that talked to the cloud deployment saved its own there",
  );
}

const child = spawn("npx", ["convex", ...process.argv.slice(2)], {
  cwd: packageRoot,
  stdio: "inherit",
  env: { ...process.env, CONVEX_AGENT_MODE: "anonymous", CONVEX_DEPLOYMENT: DEPLOYMENT },
});

// The watcher is the case that matters: Ctrl-C reaches this process, and the child has to
// be asked to stop rather than left holding port 3210.
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
