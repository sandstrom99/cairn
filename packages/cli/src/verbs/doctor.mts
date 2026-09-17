// cn doctor — whether this machine can run cn against a deployment.
//
//   cn doctor          one line per check; exit 1 if any fails
//
// Checks the Node floor, that the generated Convex API is importable (so @cairn/backend
// is installed and codegen has run), and which deployment config resolves. It does not
// call the deployment: there is no function to call yet.

import { resolveDeployment, configPath } from "../lib/config.mts";
import { usageFromHeader } from "../lib/cli.mts";
import { parseArgs } from "../lib/args.mts";

export const name = "doctor";
export const summary = "whether this machine can run cn against a deployment";

const NODE_FLOOR = 24;

export async function run(argv: string[]): Promise<number> {
  const { opts } = parseArgs(argv, { bool: ["help"] });
  if (opts.help) {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }

  let failed = 0;
  const ok = (line: string) => console.log(`✓ ${line}`);
  const bad = (line: string) => {
    failed++;
    console.log(`✗ ${line}`);
  };

  const major = Number(process.versions.node.split(".")[0]);
  if (major >= NODE_FLOOR) ok(`node ${process.versions.node}`);
  else
    bad(
      `node ${process.versions.node}: cn needs ${NODE_FLOOR} or later (it strips the types itself)`,
    );

  try {
    const { api } = await import("../lib/client.mts");
    ok(`generated api importable (${Object.keys(api).length} module(s))`);
  } catch (e) {
    bad(`generated api: ${(e as Error).message} — run \`vp install\` then \`vp run codegen\``);
  }

  const dep = resolveDeployment();
  if (dep) ok(`deployment ${dep.name} → ${dep.url} (from ${dep.source})`);
  else bad(`no deployment: set CAIRN_URL, or write ${configPath()}`);

  return failed ? 1 : 0;
}
