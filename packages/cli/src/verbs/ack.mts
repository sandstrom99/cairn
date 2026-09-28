// cn ack — "seen", on a blocker: the person's own, or an agent's on their word.
//
//   cn ack <bl-id> [--said <what the person said>]
//
// It moves the blocker from raised to waiting and changes nothing else: the issues it
// holds stay out of `cn ready`, because acknowledging a wait is not ending one. What it
// buys is the distinction in `cn waiting` between what has been looked at and what has
// not.
//
// An agent acks only on the person's word: `--said` carries what they said, verbatim, and
// the event keeps it. Without it an agent is refused, because a session that could
// acknowledge its own blocker unprompted would acknowledge every one (docs/design.md §6).
// A person's own `cn ack` needs no `--said`.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyId } from "../lib/flags.mts";
import { api, connect } from "../lib/client.mts";
import { blockerLine } from "../lib/lines.mts";

export const name = "ack";
export const summary = "saying seen to a blocker, the person's own or an agent's on their word";
export const spec = { value: ["said"] } as const satisfies ArgSpec;

type Parsed = { action: "ack"; args: { id: string; said?: string } };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  const id = onlyId(pos, "cn ack <bl-id> [--said <what the person said>]");
  const said = opts.said?.trim();
  return { action: "ack", args: { id, ...(said ? { said } : {}) } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client, actor } = connect();
  console.log(blockerLine(await client.mutation(api.blockers.ack, { actor, ...parsed.args })));
  return 0;
}
