// cn doctor — whether this machine can run cn against a deployment.
//
//   cn doctor [--json]      one line per check; exit 1 if any fails
//
// Checks the Node floor, that the generated Convex API is importable (so @cairn/backend
// is installed and codegen has run), which deployment config resolves, who this shell
// acts as and what it declares it can do, and then calls that deployment:
// `projects.list` is the ping, so a green doctor means a verb will run.
//
// Where the deployment is fenced by a secret (docs/design.md §12), the ping is what
// proves the secret this machine holds is the one the deployment wants, and the line
// after it says so. Doctor names where a secret came from and never prints it.
//
// The actor and the capabilities are facts, never failures: the name a claim will carry
// and the session beside it (lib/actor.mts), and the list `cn ready` marks rows against
// (lib/can.mts), so a `--mine` that finds nothing or a row marked `needs ios` can be read
// back to where the name or the list came from.
//
// --json is the same checks as rows, `{ check, ok, line }`, named node, api, deployment,
// actor and can, then ping where a deployment resolved, and secret where one was held
// and taken.
//
// The `deployment <name> → <url> (…)` line is read by the SessionStart hook
// (plugins/cairn/hooks/session-start.sh) to name a deployment that did not answer, so
// its shape is a contract: the name is the token after `deployment `, before the arrow.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyFlags } from "../lib/flags.mts";
import type { Actor } from "../lib/actor.mts";
import { answer, checkLine } from "../lib/cli.mts";
import { type Deployment, noDeploymentMessage } from "../lib/config.mts";
import type { Ping } from "../lib/ping.mts";
import { session } from "../lib/session.mts";

export const name = "doctor";
export const summary = "whether this machine can run cn against a deployment";
export const spec = { bool: ["json"] } as const satisfies ArgSpec;

const NODE_FLOOR = 24;

type Check = {
  check: "node" | "api" | "deployment" | "actor" | "can" | "ping" | "secret";
  ok: boolean;
  line: string;
};

type Parsed = { action: "doctor"; json: boolean };

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

/** Who this shell acts as, and in which session, when the hook exported one. */
export function actorCheck(me: Actor): Check {
  const who = `actor ${me.name} (${me.kind})`;
  return {
    check: "actor",
    ok: true,
    line: me.session === undefined ? `${who}, no session` : `${who}, session ${me.session}`,
  };
}

/** What this session declares it can do; nothing declared marks every fenced row. */
export function canCheck(can: string[]): Check {
  return {
    check: "can",
    ok: true,
    line: can.length > 0 ? `can ${can.join(" ")}` : "can nothing declared",
  };
}

/** The ping read as checks: answered, and the secret taken where one was held; or why not. */
export function pingChecks(dep: Deployment | null, ping: Ping): Check[] {
  if (ping.answered) {
    const checks: Check[] = [
      { check: "ping", ok: true, line: `deployment answered: ${ping.projects} project(s)` },
    ];
    if (dep?.secret)
      checks.push({ check: "secret", ok: true, line: `secret accepted by ${dep.name}` });
    return checks;
  }
  const line =
    ping.refused && dep ? refusedLine(dep) : `deployment did not answer: ${ping.message}`;
  return [{ check: "ping", ok: false, line }];
}

/**
 * What a refused secret means, by where it came from: the shell's is the shell's to fix,
 * and the file's is `cn init --refresh`'s, which re-runs the command this machine keeps.
 */
function refusedLine(dep: Deployment): string {
  if (dep.source === "env" || dep.secretSource === "env")
    return `${dep.name} ${dep.secret ? "refused CAIRN_SECRET" : "needs a secret"}: set CAIRN_SECRET to the deployment's current one`;
  return dep.secret
    ? `${dep.name} refused the secret this machine holds: cn init --refresh --name ${dep.name} takes the current one`
    : `${dep.name} needs a secret: cn init --refresh --name ${dep.name} --secret-cmd '<command>' stores one`;
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

  const { deployment, actor, can } = session();
  checks.push(deploymentCheck(deployment), actorCheck(actor), canCheck(can));

  // The ping needs the generated api, so it loads the way the api check did: a machine
  // where codegen has not run gets that line, not a crash before any line.
  if (deployment) {
    const { ping } = await import("../lib/ping.mts");
    checks.push(...pingChecks(deployment, await ping(deployment)));
  }

  answer(parsed.json, checks, checkLines);
  return checks.every((c) => c.ok) ? 0 : 1;
}
