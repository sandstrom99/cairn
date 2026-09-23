// cn ack — a person saying "seen" to a blocker.
//
//   cn ack <bl-id>
//
// It moves the blocker from raised to waiting and changes nothing else: the issues it
// holds stay out of `cn ready`, because acknowledging a wait is not ending one. What it
// buys is the distinction in `cn waiting` between what has been looked at and what has
// not.
//
// An agent is refused. Agents raise blockers and people end them (docs/design.md §6),
// and a session that could acknowledge its own blocker would acknowledge every one.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyId } from "../lib/flags.mts";
import { actor } from "../lib/actor.mts";
import { api, connect } from "../lib/client.mts";
import { blockerLine } from "../lib/lines.mts";

export const name = "ack";
export const summary = "a person saying seen: a blocker moves from raised to waiting";
export const spec = {} as const satisfies ArgSpec;

export type Parsed = { action: "ack"; args: { id: string } };

export function parse(argv: string[]): Parsed {
  const { pos } = parseArgs(argv, spec);
  const id = onlyId(pos, "cn ack <bl-id>");
  return { action: "ack", args: { id } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client } = connect();
  console.log(
    blockerLine(await client.mutation(api.blockers.ack, { actor: actor(), ...parsed.args })),
  );
  return 0;
}
