// cn brief — the situation report a session opens with.
//
//   cn brief [--json]
//   cn brief --unjournaled [--json]
//
// Under 20 lines: which projects the deployment has, then the counts and the head of each
// queue — what is ready, what is in progress and who holds it, the open follow-ups, how
// much waits on a person. State, and never rules: the rules are in the skill, which loads
// on demand, and a hook always loads.
//
// With no deployment configured it prints nothing and exits 0, so the SessionStart hook
// costs a session nothing on a machine that has never heard of cairn.
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

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyFlags } from "../lib/flags.mts";
import { answer } from "../lib/cli.mts";
import { api, connectTo } from "../lib/client.mts";
import { briefLines, unjournaledLine } from "../lib/lines.mts";
import { unjournaled } from "../lib/parts.mts";
import { session } from "../lib/session.mts";

export const name = "brief";
export const summary =
  "the situation report a session opens with: counts and the head of each queue";
export const spec = { bool: ["json", "unjournaled"] } as const satisfies ArgSpec;

type Parsed = { action: "brief"; json: boolean; unjournaled: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  onlyFlags(pos, "cn brief [--unjournaled] [--json]");
  return { action: "brief", json: opts.json, unjournaled: opts.unjournaled };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  // Nothing configured is not an error here: a hook on a machine without cairn is silent.
  // A deployment that is configured and does not answer throws, like every other verb.
  const { deployment, actor: me } = session();
  if (!deployment) return 0;

  const client = connectTo(deployment);
  // The actor goes along so the deployment can mark which claims are this session's.
  const view = await client.query(api.brief.get, { actor: me });
  if (parsed.unjournaled) {
    // The rows are the deployment's marks on what it says is this session's; the line is
    // one or none, and a silent exit 0 is the answer "nothing held quiet".
    answer(parsed.json, unjournaled(view), () => {
      const line = unjournaledLine(view);
      return line === undefined ? [] : [line];
    });
    return 0;
  }
  answer(parsed.json, view, (v) => briefLines(v, { deployment: deployment.name, actor: me.name }));
  return 0;
}
