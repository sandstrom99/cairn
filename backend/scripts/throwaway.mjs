// throwaway.mjs: an empty anonymous deployment, on its own ports and its own state.
//
//   node scripts/throwaway.mjs                     hold one open (#dev:throwaway)
//   import { startThrowaway } from "…/throwaway.mjs"   start one, use it, stop it
//
// The per-verb rows of AGENTS.md read the ids an empty deployment mints — ep-1, cn-1,
// bl-1 — so they can only run somewhere nothing has ever run. This starts that place.
//
// It runs convex from a mirror directory rather than from `backend/`: a temp directory
// whose entries are symlinks back into `backend/`. convex 1.46 keys an anonymous
// deployment's state off the project directory, `<cwd>/.convex/local/default/`, and not
// off the port, so `--local-cloud-port` alone would hand the dev deployment's sqlite to
// a run that is supposed to start empty. From the mirror, `.env.local`, `.gitignore` and
// `.convex/` all land inside the temp directory: `backend/.env.local` and
// `backend/.convex` are never read and never written here.
//
// convex spawns `convex-local-backend` as a child of its own and handles SIGINT alone,
// so a SIGTERM to the node process leaves that backend orphaned on both ports. The child
// is therefore started detached, as its own process group leader, and teardown goes to
// the group rather than to the pid.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** What the mirror directory links back to, so convex resolves as it would in backend/. */
const MIRRORED = ["convex", "node_modules", "package.json", "tsconfig.json", "convex.json"];

/** The environment convex must not inherit: each of these would name another deployment. */
const UNSET = [
  "CONVEX_DEPLOYMENT",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
];

const READY = "Convex functions ready!";
/** A first run on a machine downloads the backend binary before it says anything. */
const START_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 5_000;
const KILL_TIMEOUT_MS = 2_000;
const POLL_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Two distinct ports the OS chose, held open together so they cannot be the same one. */
function freePorts() {
  return new Promise((resolve, reject) => {
    const servers = [createServer(), createServer()];
    const fail = (e) => {
      for (const server of servers) server.close();
      reject(e);
    };
    let listening = 0;
    for (const server of servers) {
      server.once("error", fail);
      server.listen(0, "127.0.0.1", () => {
        if (++listening < servers.length) return;
        const ports = servers.map((s) => s.address().port);
        let closed = 0;
        for (const s of servers) {
          s.close(() => {
            if (++closed === servers.length) resolve(ports);
          });
        }
      });
    }
  });
}

/** Whether a TCP connect to the port is refused, which is how "the backend is gone" reads. */
function refused(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(true);
    });
  });
}

/**
 * Starts an empty anonymous deployment and waits until its functions are pushed.
 *
 * @returns {Promise<{ url: string, siteUrl: string, dir: string, stop: () => Promise<void> }>}
 */
export async function startThrowaway() {
  const [cloudPort, sitePort] = await freePorts();
  const dir = mkdtempSync(join(tmpdir(), "cairn-throwaway-"));
  for (const entry of MIRRORED) {
    const target = join(packageRoot, entry);
    if (existsSync(target)) symlinkSync(target, join(dir, entry));
  }

  const env = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
  for (const key of UNSET) delete env[key];

  const child = spawn(
    process.execPath,
    [
      join(packageRoot, "node_modules", "convex", "bin", "main.js"),
      "dev",
      "--local-cloud-port",
      String(cloudPort),
      "--local-site-port",
      String(sitePort),
      // `vp check` type-checks this tree already, and `@cairn/backend#verify` is the row
      // for Convex's own tsc; here it is a second of startup per run and nothing else.
      "--typecheck",
      "disable",
      "--tail-logs",
      "disable",
    ],
    { cwd: dir, detached: true, stdio: ["ignore", "pipe", "pipe"], env },
  );

  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      output += chunk;
    });
  }

  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  // A throw or a crash anywhere in the caller must not leave a backend on these ports,
  // nor its state in the temp directory.
  const onExit = () => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // Already gone, which is the outcome this wanted.
    }
    rmSync(dir, { recursive: true, force: true });
  };
  process.once("exit", onExit);

  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
  };

  /** Whether the child has exited and its backend has let the cloud port go, within `ms`. */
  const gone = async (ms) => {
    const deadline = Date.now() + ms;
    for (;;) {
      if (exited && (await refused(cloudPort))) return true;
      if (Date.now() >= deadline) return false;
      await sleep(POLL_MS);
    }
  };

  const stopOnce = async () => {
    try {
      signalGroup("SIGINT");
      if (await gone(STOP_TIMEOUT_MS)) return;
      signalGroup("SIGKILL");
      if (await gone(KILL_TIMEOUT_MS)) return;
      throw new Error(
        `the throwaway deployment would not stop: port ${cloudPort} is still listening, pid ${child.pid}`,
      );
    } finally {
      process.off("exit", onExit);
      rmSync(dir, { recursive: true, force: true });
    }
  };

  // A second call, a second Ctrl-C for one, waits on the first rather than returning
  // early and letting the caller exit with the teardown half done.
  let stopping;
  const stop = () => (stopping ??= stopOnce());

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (!output.includes(READY)) {
    if (exited) {
      await stop();
      throw new Error(`the throwaway deployment exited before it was ready:\n${output}`);
    }
    if (Date.now() >= deadline) {
      await stop();
      throw new Error(
        `the throwaway deployment was not ready in ${START_TIMEOUT_MS / 1000}s:\n${output}`,
      );
    }
    await sleep(POLL_MS);
  }

  return {
    url: `http://127.0.0.1:${cloudPort}`,
    siteUrl: `http://127.0.0.1:${sitePort}`,
    dir,
    stop,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let deployment;
  try {
    deployment = await startThrowaway();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  // stdout is the one line a caller wants to export; the hint goes to stderr beside it.
  process.stdout.write(`CAIRN_URL=${deployment.url}\n`);
  console.error("· an empty throwaway deployment; Ctrl-C stops it and deletes its state");
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      void deployment.stop().then(() => process.exit(0));
    });
  }
}
