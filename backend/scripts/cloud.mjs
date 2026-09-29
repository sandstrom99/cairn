// cloud.mjs: `convex dev` against the cloud deployments, with `.env.local` left alone.
//
//   node scripts/cloud.mjs [<name>]           the watcher, against one     (#dev:cloud)
//   node scripts/cloud.mjs --once [<name>]    a push, then the page, each  (#push:cloud)
//
// A checkout keeps one cloud deployment per company, one `backend/.env.cloud.<name>.local`
// each, and clouds.mjs says which a command runs against. A push goes to every deployment
// the checkout keeps unless one is named, in name order, so a backend change cannot reach
// one company's worklist and not another's; it stops at the first that fails and names
// the ones it did not reach. The watcher holds one deployment open, so it runs against the
// one named, or the only one. A word on its own is a deployment's name, and a flag for
// convex goes through with its value joined, `--flag=value`.
//
// convex 1.46 saves the deployment it just talked to into `.env.local` — its name, its
// client URL and its HTTP actions URL — whatever `--env-file` says, because the write-back
// target is hardcoded rather than taken from the flag. So a bare cloud push silently
// rebinds this checkout to the cloud deployment.
//
// That binding has to survive: `#verify`, `#dev` and the Convex MCP server in `.mcp.json`
// all read `.env.local`, and none of them says which deployment it reached. This wrapper
// holds the file's bytes, runs the pushes, and writes them back exactly as they were when
// the last child exits, however it exits.
//
// A push that landed ships the page after it (scripts/page.mjs), so the functions and the
// page they serve at the deployment's `.convex.site` URL go out in one command and cannot
// drift.
// The upload names the cloud deployment in its environment, which convex takes over any
// file, so it reaches the cloud whatever `.env.local` says in the meantime. The watcher
// ships no page: `vp run dev:web` is the loop for the page, and the watcher's is the
// functions'.
//
// Between the two, a push records on the deployment the commit its functions came from
// (scripts/pushed.mjs), which `cn doctor` compares with the checkout it runs from. The
// watcher records one before it starts, marked `-dirty` whatever the tree holds, since it
// pushes the working tree as it changes and what it serves is never a commit.
import { pickClouds } from "./clouds.mjs";
import { shipPage } from "./page.mjs";
import { pushedFrom, recordPush } from "./pushed.mjs";
import { convexStatus, holdEnvLocal, runConvex } from "./run-convex.mjs";

const USAGE = "usage: vp run @cairn/backend#push:cloud [-- <name>], or #dev:cloud [-- <name>]";

// vp hands on the `--` that separates its own flags from the script's.
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const once = args.includes("--once");
const flags = args.filter((arg) => arg.startsWith("-") && arg !== "--once");
const names = args.filter((arg) => !arg.startsWith("-"));
if (names.length > 1) {
  console.error(USAGE);
  process.exit(2);
}

const picked = pickClouds({ name: names[0], one: !once });
if (picked.targets === undefined) {
  console.error(picked.message);
  process.exit(picked.code);
}
const { targets } = picked;

const restore = holdEnvLocal();

/** The line a push or a watcher says in place of a record, outside a git checkout. */
const unrecorded = (t) => `not recorded: ${t.name} is pushed from outside a git checkout`;

if (!once) {
  const [t] = targets;
  const commit = pushedFrom();
  if (commit === null) console.error(unrecorded(t));
  else {
    const value = commit.endsWith("-dirty") ? commit : `${commit}-dirty`;
    const status = recordPush({ value, env: { ...process.env, CONVEX_DEPLOYMENT: t.deployment } });
    if (status !== 0) {
      restore();
      process.exit(status);
    }
  }
  console.error(`watching ${t.name} (${t.deployment})`);
  runConvex(["dev", "--env-file", t.envFile, ...flags], { onExit: restore });
} else {
  // A signal between pushes, or while the page ships, would otherwise end this process
  // before the `finally` puts `.env.local` back. It stops the run after the step under way
  // instead; convexStatus hands it to a convex that is running.
  let interrupted = false;
  const interrupt = () => (interrupted = true);
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);

  let status = 0;
  try {
    for (const [i, t] of targets.entries()) {
      console.error(`pushing ${t.name} (${t.deployment})`);
      try {
        status = await convexStatus(["dev", "--once", "--env-file", t.envFile, ...flags]);
        const env = { ...process.env, CONVEX_DEPLOYMENT: t.deployment };
        if (status === 0) {
          const value = pushedFrom();
          if (value === null) console.error(unrecorded(t));
          else status = recordPush({ value, env });
        }
        if (status === 0) status = (await shipPage({ env })).status;
      } catch (e) {
        console.error(e.message);
        status = 1;
      }
      if (interrupted && status === 0) status = 1;
      if (status !== 0) {
        const rest = targets.slice(i + 1).map((r) => r.name);
        console.error(
          `stopped at ${t.name}${rest.length ? `; not pushed: ${rest.join(", ")}` : ""}`,
        );
        break;
      }
    }
    if (status === 0 && targets.length > 1) {
      console.error(`pushed ${targets.map((t) => t.name).join(", ")}`);
    }
  } finally {
    restore();
  }
  process.exit(status);
}
