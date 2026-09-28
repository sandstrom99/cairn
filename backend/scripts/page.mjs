// page.mjs: the page, built for one deployment and uploaded into it.
//
//   import { shipPage } from "./page.mjs"   `cloud.mjs --once` after the functions land,
//                                           and the e2e row against its throwaway
//
// `@convex-dev/static-hosting` (convex/convex.config.ts) serves whatever was last uploaded
// here at the deployment's site root. The upload goes through the component's own CLI, and
// with `--build` that CLI first asks the component which client URL the deployment answers
// on and hands it to the build as `VITE_CONVEX_URL`. The build command renames it to
// `VITE_CAIRN_URL`, the one variable the page reads (apps/web/src/env.d.ts), so the bundle
// talks to the deployment that serves it by construction rather than by a URL copied into
// a file. The CLI then uploads every file and publishes the set in one mutation, so a
// failed upload leaves the last page up.
//
// Which deployment is the caller's to say, with the directory and the environment a
// `convex` command there runs with: `backend/` and the cloud's `CONVEX_DEPLOYMENT` for
// `#push:cloud`, the throwaway's mirror and its environment for the e2e row. Both paths
// reach the build through the environment rather than spelled into the shell line, and
// the build goes to a temp directory, so `apps/web/dist` never holds a bundle bound to a
// deployment.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { packageRoot } from "./run-convex.mjs";

/** `apps/web`, the page's own package. */
const WEB = join(dirname(packageRoot), "apps", "web");

const UPLOAD = join(
  packageRoot,
  "node_modules",
  "@convex-dev",
  "static-hosting",
  "dist",
  "cli",
  "index.js",
);

/** The page's own `vp build`, with the URL the component reported and the paths from above. */
const BUILD = `VITE_CAIRN_URL="$VITE_CONVEX_URL" vp build "$CAIRN_PAGE_WEB" --outDir "$CAIRN_PAGE_OUT" --emptyOutDir`;

/**
 * Builds the page for the deployment `cwd` and `env` reach and uploads it there. `status` is
 * 0 once the new page is live, and the CLI's own otherwise, having said why. With `quiet`
 * the build's and the upload's lines come back as `output` instead of going to the terminal,
 * for a caller that prints them only when something failed.
 *
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, quiet?: boolean }} [options]
 * @returns {Promise<{ status: number, output: string }>}
 */
export async function shipPage({ cwd = packageRoot, env = process.env, quiet = false } = {}) {
  const out = mkdtempSync(join(tmpdir(), "cairn-page-"));
  try {
    const child = spawn(
      process.execPath,
      [UPLOAD, "upload", "--build", "--build-command", BUILD, "--dist", out],
      {
        cwd,
        env: { ...env, CAIRN_PAGE_WEB: WEB, CAIRN_PAGE_OUT: out },
        stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      },
    );
    let output = "";
    for (const stream of [child.stdout, child.stderr]) {
      stream?.setEncoding("utf8");
      stream?.on("data", (chunk) => {
        output += chunk;
      });
    }
    const status = await new Promise((resolve) => {
      child.on("error", (e) => {
        output += `the page upload did not start: ${e.message}\n`;
        if (!quiet) console.error(`the page upload did not start: ${e.message}`);
        resolve(1);
      });
      child.on("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    return { status, output };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
