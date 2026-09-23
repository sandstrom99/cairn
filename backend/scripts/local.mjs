// local.mjs: every `convex` command against the anonymous local deployment.
//
//   node scripts/local.mjs dev          the watcher   (#dev)
//   node scripts/local.mjs dev --once   one push      (#verify)
//   node scripts/local.mjs codegen      the generated code (#codegen)
//
// It heals `backend/.env.local` and then ignores it. convex 1.46 saves the deployment it
// just talked to into that file — its name and both URLs — whatever `--env-file` says, so
// anything that reaches the cloud deployment rebinds this checkout on the way past.
// `scripts/cloud.mjs` puts the file back after itself; a bare `npx convex` in `backend/`
// is the one path left that can flip it, and the next command through here corrects it.
// The test is the `CONVEX_DEPLOYMENT` line alone, since convex rewrites the header from
// release to release and a header is not a binding.
//
// The child also carries `CONVEX_DEPLOYMENT` in its environment, which convex takes over
// the file, so a push here goes to the local deployment even while the file is wrong.
import { existsSync, writeFileSync } from "node:fs";
import { deploymentIn, envLocal, runConvex } from "./run-convex.mjs";

const DEPLOYMENT = "anonymous:anonymous-agent";

/** What `backend/.env.local` says when this checkout is bound to the local deployment. */
const LOCAL_ENV = `# Deployment used by \`npx convex dev\`
CONVEX_DEPLOYMENT=${DEPLOYMENT}

CONVEX_URL=http://127.0.0.1:3210

CONVEX_SITE_URL=http://127.0.0.1:3211
`;

if (deploymentIn(envLocal) !== DEPLOYMENT) {
  const had = existsSync(envLocal);
  writeFileSync(envLocal, LOCAL_ENV);
  console.error(
    had
      ? "· put the local binding back in backend/.env.local: something that talked to the cloud deployment saved its own there"
      : "· wrote backend/.env.local, binding this checkout to the local deployment",
  );
}

runConvex(process.argv.slice(2), {
  env: { ...process.env, CONVEX_AGENT_MODE: "anonymous", CONVEX_DEPLOYMENT: DEPLOYMENT },
});
