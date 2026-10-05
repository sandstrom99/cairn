// cn doctor — whether this machine can run cn against a deployment.
//
//   cn doctor [--json]      one line per check; exit 1 if any fails
//
// Checks the Node floor, that the generated Convex API is importable (so @cairn/backend
// is installed and codegen has run), which deployment config resolves and which of
// CAIRN_URL, CAIRN_DEPLOYMENT or the file's default chose it, who this shell acts as and
// what it declares it can do, and then calls that deployment: `projects.list` is the
// ping, so a green doctor means a verb will run.
//
// Where the deployment is fenced by a secret (docs/design.md §12), the ping is what
// proves the secret this machine holds is the one the deployment wants, and the line
// after it says so. Doctor names where a secret came from and never prints it; a secret an
// older cn cached in config.json is named with the refresh that moves it.
//
// Where the ping answered, the last line is the functions: the commit `#push:cloud`
// recorded on the deployment (`deployment.pushedFrom`) against the commit this cn runs
// from, read with git, saying which side is behind and the one command that fixes it
// (lib/pushed.mts). A deployment with no record passes, since only `#push:cloud` records
// one; a deployment without `deployment.pushedFrom` at all runs functions older than it.
//
// The page is a fact too: the deployment's URL with `.convex.cloud` changed to
// `.convex.site`, region and all, which is where `#push:cloud` ships it. A machine that
// joined a deployment holds only the `.convex.cloud` URL it was given, so this line is
// how it learns where the page is. A deployment on any other host has no such line.
//
// The actor is a fact, never a failure: the name a claim will carry and the session beside
// it (lib/actor.mts), so a `--mine` that finds nothing can be read back to where the name
// came from. The settings this machine has set (`cn setting`) are a fact too, each with
// its state, on a line that is there only when one is not off.
//
// --json is the same checks as rows, `{ check, ok, line }`, named node, api, deployment,
// page where the deployment is a cloud one, actor, settings where one is not off, then ping
// where a deployment resolved, secret where one was held and taken, and functions where
// the ping answered.
//
// The `deployment <name> → <url> (…)` line is read by the SessionStart hook
// (plugins/cairn/hooks/session-start.sh) to name a deployment that did not answer, so
// its shape is a contract: the name is the token after `deployment `, before the arrow.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyFlags } from "../lib/flags.mts";
import type { Actor } from "../lib/actor.mts";
import { answer, checkLine, errorData, redacted } from "../lib/cli.mts";
import { type CairnConfig, type Deployment, noDeploymentMessage } from "../lib/config.mts";
import type { Ping } from "../lib/ping.mts";
import {
  type Check,
  checkoutRoot,
  functionsCheck,
  isMissingFunction,
  label,
} from "../lib/pushed.mts";
import { session } from "../lib/session.mts";
import { SETTINGS, type Setting, settingsSet } from "../lib/settings.mts";

export const name = "doctor";
export const summary = "whether this machine can run cn against a deployment";
export const spec = { bool: ["json"] } as const satisfies ArgSpec;

const NODE_FLOOR = 24;

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
  const secret =
    dep.secretSource === "env"
      ? "secret from CAIRN_SECRET"
      : dep.secretSource === "file"
        ? `secret from secrets/${dep.name}`
        : dep.secretSource === "config"
          ? `secret from config.json; cn init --refresh --name ${dep.name} moves it to secrets/${dep.name}`
          : "no secret";
  return {
    check: "deployment",
    ok: true,
    line: `deployment ${dep.name} → ${dep.url} (from ${dep.source}, ${secret})`,
  };
}

/**
 * The page's URL for a cloud deployment's: the same host with `.convex.site` for
 * `.convex.cloud`, the region kept. Undefined for any other URL, a local deployment's
 * among them, whose site port cn cannot know.
 */
export function pageUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".convex.cloud")) return undefined;
  return `https://${parsed.hostname.replace(/\.convex\.cloud$/, ".convex.site")}`;
}

/** Where the deployment serves its page, for a cloud deployment; nothing otherwise. */
export function pageCheck(dep: Deployment | null): Check[] {
  const url = dep ? pageUrl(dep.url) : undefined;
  return url ? [{ check: "page", ok: true, line: `page ${url}` }] : [];
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

/** The settings this machine has set (`cn setting`), each with its state; no line when all are off. */
export function settingsCheck(
  config: CairnConfig | null,
  settings: readonly Setting[] = SETTINGS,
): Check[] {
  const set = settingsSet(config, settings);
  return set.length === 0
    ? []
    : [
        {
          check: "settings",
          ok: true,
          line: `settings ${set.map((s) => `${s.name} ${s.state}`).join(", ")}`,
        },
      ];
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
  if (dep.source === "CAIRN_URL" || dep.secretSource === "env")
    return `${dep.name} ${dep.secret ? "refused CAIRN_SECRET" : "needs a secret"}: set CAIRN_SECRET to the deployment's current one`;
  return dep.secret
    ? `${dep.name} refused the secret this machine holds: cn init --refresh --name ${dep.name} takes the current one`
    : `${dep.name} needs a secret: cn init --refresh --name ${dep.name} --secret-cmd '<command>' stores one`;
}

/**
 * The functions line when `deployment.pushedFrom` threw. The client has already rewritten
 * a missing function into its own line, so the error it replaced is read off `cause`: no
 * such function means the deployment predates the record, and so this cn.
 */
export function functionsFailed(dep: Deployment, e: unknown, root: string): Check {
  const original = e instanceof Error && e.cause instanceof Error ? e.cause : e;
  if (original instanceof Error && isMissingFunction(original.message))
    return functionsCheck(dep, "missing", root);
  const said = errorData(e)?.message ?? (e instanceof Error ? e.message : String(e));
  return { check: "functions", ok: false, line: `functions on ${label(dep)}: ${redacted(said)}` };
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

  const { config, deployment, actor } = session();
  checks.push(
    deploymentCheck(deployment),
    ...pageCheck(deployment),
    actorCheck(actor),
    ...settingsCheck(config),
  );

  // The ping needs the generated api, so it loads the way the api check did: a machine
  // where codegen has not run gets that line, not a crash before any line.
  if (deployment) {
    const { ping } = await import("../lib/ping.mts");
    const pinged = await ping(deployment);
    checks.push(...pingChecks(deployment, pinged));
    if (pinged.answered) {
      const { api, connectTo } = await import("../lib/client.mts");
      const root = checkoutRoot();
      try {
        const recorded = await connectTo(deployment).query(api.deployment.pushedFrom, {});
        checks.push(functionsCheck(deployment, recorded, root));
      } catch (e) {
        checks.push(functionsFailed(deployment, e, root));
      }
    }
  }

  answer(parsed.json, checks, checkLines);
  return checks.every((c) => c.ok) ? 0 : 1;
}
