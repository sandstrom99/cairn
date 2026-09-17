// cn brief — the situation report a session opens with.
//
//   cn brief [--can ios android web device decision] [--json]
//
// Under 20 lines: the counts and the head of each queue — what is ready, what is in
// progress and who holds it, the follow-ups this session could finish, how much waits on
// a person, what reconcile flagged. State, and never rules: the rules are in the skill,
// which loads on demand, and a hook always loads.
//
// With no deployment configured it prints nothing and exits 0, so the SessionStart hook
// costs a session nothing on a machine that has never heard of cairn.
//
// --can says what this session has; without it, CAIRN_CAN, then `can` in
// ~/.config/cairn/config.json. The follow-ups line is the one place a capability list
// subtracts rather than marks, and it says how many it left out; `cn ready` is the list,
// and every row is there, marked.

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { can } from "../lib/can.mts";
import { usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { resolveDeployment } from "../lib/config.mts";
import { briefLines } from "../lib/format.mts";

export const name = "brief";
export const summary =
  "the situation report a session opens with: counts and the head of each queue";

export type Parsed =
  | { action: "help" }
  | { action: "brief"; json: boolean; can: string[] | undefined };

export function parse(argv: string[]): Parsed {
  const { opts } = parseArgs(argv, { bool: ["help", "json"], list: ["can"] });
  if (opts.help) return { action: "help" };
  return {
    action: "brief",
    json: Boolean(opts.json),
    can: Array.isArray(opts.can) ? opts.can : undefined,
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  // Nothing configured is not an error here: a hook on a machine without cairn is silent.
  // A deployment that is configured and does not answer throws, like every other verb.
  const deployment = resolveDeployment();
  if (!deployment) return 0;

  const capabilities = can(parsed.can);
  const { client } = connect();
  const view = await client.query(api.brief.get, { can: capabilities });
  if (parsed.json) console.log(JSON.stringify(view, null, 2));
  else
    console.log(
      briefLines(view, {
        deployment: deployment.name,
        actor: actor().name,
        can: capabilities,
      }).join("\n"),
    );
  return 0;
}
