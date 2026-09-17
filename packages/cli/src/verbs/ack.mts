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

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { blockerLine } from "../lib/format.mts";

export const name = "ack";
export const summary = "a person saying seen: a blocker moves from raised to waiting";

export type Parsed = { action: "help" } | { action: "ack"; args: { id: string } };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help"] });
  if (opts.help) return { action: "help" };
  const [id, ...rest] = pos;
  if (!id || rest.length > 0) throw new UsageError("cn ack <bl-id>");
  return { action: "ack", args: { id } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  console.log(
    blockerLine(await client.mutation(api.blockers.ack, { actor: actor(), ...parsed.args })),
  );
  return 0;
}
