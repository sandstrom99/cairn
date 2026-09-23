// cn brief — the situation report a session opens with.
//
//   cn brief [--can ios android web device decision] [--json]
//   cn brief --unjournaled [--json]
//
// Under 20 lines: the counts and the head of each queue — what is ready, what is in
// progress and who holds it, the follow-ups this session could finish, how much waits on
// a person. State, and never rules: the rules are in the skill,
// which loads on demand, and a hook always loads.
//
// With no deployment configured it prints nothing and exits 0, so the SessionStart hook
// costs a session nothing on a machine that has never heard of cairn.
//
// --can says what this session has; without it, CAIRN_CAN, then `can` in
// ~/.config/cairn/config.json. The follow-ups line is the one place a capability list
// subtracts rather than marks, and it says how many it left out; `cn ready` is the list,
// and every row is there, marked.
//
// --unjournaled is the other end of a session: only what this session holds with nothing
// journaled for longer than the threshold, as one line, or nothing at all:
//
//   you hold cn-27 "retry on reconnect", last journal 3h ago
//
// That is what the plugin's Stop hook hands back. The clock and the threshold are the
// deployment's (`unjournaledSince` on a brief.get row, counted from the later of the claim
// and its newest entry), and a shell with no session (CAIRN_SESSION) holds nothing. With
// --json it prints those rows.

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { can } from "../lib/can.mts";
import { usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { resolveDeployment } from "../lib/config.mts";
import { briefLines, unjournaledLine } from "../lib/lines.mts";
import { unjournaled } from "../lib/parts.mts";

export const name = "brief";
export const summary =
  "the situation report a session opens with: counts and the head of each queue";

export type Parsed =
  | { action: "help" }
  | { action: "brief"; json: boolean; can: string[] | undefined; unjournaled: boolean };

export function parse(argv: string[]): Parsed {
  const { opts } = parseArgs(argv, { bool: ["help", "json", "unjournaled"], list: ["can"] });
  if (opts.help) return { action: "help" };
  return {
    action: "brief",
    json: Boolean(opts.json),
    can: Array.isArray(opts.can) ? opts.can : undefined,
    unjournaled: Boolean(opts.unjournaled),
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
  // The actor goes along so the deployment can mark which claims are this session's.
  const me = actor();
  const view = await client.query(api.brief.get, { can: capabilities, actor: me });
  if (parsed.unjournaled) {
    // The rows are the deployment's marks on what it says is this session's; the line is
    // one or none, and a silent exit 0 is the answer "nothing held quiet".
    if (parsed.json) console.log(JSON.stringify(unjournaled(view), null, 2));
    else {
      const line = unjournaledLine(view);
      if (line !== undefined) console.log(line);
    }
    return 0;
  }
  if (parsed.json) console.log(JSON.stringify(view, null, 2));
  else
    console.log(
      briefLines(view, {
        deployment: deployment.name,
        actor: me.name,
        can: capabilities,
      }).join("\n"),
    );
  return 0;
}
