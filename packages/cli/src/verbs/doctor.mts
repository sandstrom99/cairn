// cn doctor — whether this machine can run cn against a deployment.
//
//   cn doctor [--json]      one line per check; exit 1 if any fails
//
// Checks the Node floor, that the generated Convex API is importable (so @cairn/backend
// is installed and codegen has run), which deployment config resolves, and then calls
// that deployment: `projects.list` is the ping, so a green doctor means a verb will run.
//
// Where the deployment is fenced by a secret (docs/design.md §12), the ping is what
// proves the secret this machine holds is the one the deployment wants, and the line
// after it says so. Doctor names where a secret came from and never prints it.
//
// --json is the same checks as rows, `{ check, ok, line }`, named node, api, deployment,
// ping and, where a secret was held and taken, secret.
//
// The `deployment <name> → <url> (…)` line is read by the SessionStart hook
// (plugins/cairn/hooks/session-start.sh) to name a deployment that did not answer, so
// its shape is a contract: the name is the token after `deployment `, before the arrow.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyFlags } from "../lib/flags.mts";
import { answer, checkLine, errorData } from "../lib/cli.mts";
import {
  type Deployment,
  configPath,
  noDeploymentMessage,
  resolveDeployment,
} from "../lib/config.mts";

export const name = "doctor";
export const summary = "whether this machine can run cn against a deployment";
export const spec = { bool: ["json"] } as const satisfies ArgSpec;

const NODE_FLOOR = 24;

export type Check = {
  check: "node" | "api" | "deployment" | "ping" | "secret";
  ok: boolean;
  line: string;
};

/** What the ping came back with: how many projects, or the error. */
export type Ping = { projects: number } | { error: unknown };

export type Parsed = { action: "doctor"; json: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  onlyFlags(pos, "cn doctor [--json]");
  return { action: "doctor", json: opts.json };
}

/** Node at the floor or past it: cn runs its .mts source as it is, which needs 24. */
export function nodeCheck(version: string): Check {
  const major = Number(version.split(".")[0]);
  return major >= NODE_FLOOR
    ? { check: "node", ok: true, line: `node ${version}` }
    : {
        check: "node",
        ok: false,
        line: `node ${version}: cn needs ${NODE_FLOOR} or later (it strips the types itself)`,
      };
}

/**
 * Which deployment resolved, from where, and where its secret came from. The secret
 * itself is never printed: where it came from is the whole diagnosis, since a wrong one
 * fails the ping by name.
 */
export function deploymentCheck(dep: Deployment | null): Check {
  if (!dep) return { check: "deployment", ok: false, line: noDeploymentMessage() };
  const secret = dep.secretSource
    ? `secret from ${dep.secretSource === "env" ? "CAIRN_SECRET" : "config"}`
    : "no secret";
  return {
    check: "deployment",
    ok: true,
    line: `deployment ${dep.name} → ${dep.url} (from ${dep.source}, ${secret})`,
  };
}

/** The ping read as checks: answered, and the secret taken where one was held; or why not. */
export function pingChecks(dep: Deployment | null, ping: Ping): Check[] {
  if ("projects" in ping) {
    const checks: Check[] = [
      { check: "ping", ok: true, line: `deployment answered: ${ping.projects} project(s)` },
    ];
    if (dep?.secret)
      checks.push({ check: "secret", ok: true, line: `secret accepted by ${dep.name}` });
    return checks;
  }
  const line =
    errorData(ping.error)?.kind === "unauthorized" && dep
      ? `${dep.name} needs a secret: put it under deployments.${dep.name}.secret in ${configPath()}, or set CAIRN_SECRET`
      : `deployment did not answer: ${(ping.error as Error).message}`;
  return [{ check: "ping", ok: false, line }];
}

/** The checks as lines, marked. */
export const checkLines = (checks: Check[]): string[] => checks.map((c) => checkLine(c.ok, c.line));

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const checks: Check[] = [nodeCheck(process.versions.node)];

  try {
    const { api } = await import("../lib/client.mts");
    // `api` is a Proxy, so nothing enumerates it; touching one function reference proves
    // the generated module resolved and codegen has run.
    if (!api.projects.list) throw new Error("api.projects.list is missing; codegen has not run");
    checks.push({ check: "api", ok: true, line: "generated api importable" });
  } catch (e) {
    checks.push({
      check: "api",
      ok: false,
      line: `generated api: ${(e as Error).message} — run \`vp install\` then \`vp run codegen\``,
    });
  }

  const dep = resolveDeployment();
  checks.push(deploymentCheck(dep));

  let ping: Ping;
  try {
    const { api, connect } = await import("../lib/client.mts");
    ping = { projects: (await connect().client.query(api.projects.list, {})).length };
  } catch (error) {
    ping = { error };
  }
  checks.push(...pingChecks(dep, ping));

  answer(parsed.json, checks, checkLines);
  return checks.every((c) => c.ok) ? 0 : 1;
}
