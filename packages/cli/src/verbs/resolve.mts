// cn resolve — end a blocker, and free every issue it holds.
//
//   cn resolve <bl-id> --note <what happened>
//
// The issues come back into `cn ready` immediately, with nothing recomputed in between:
// readiness is asked live on every call, so resolving here is the whole of it.
//
// The note is the record. It is what the agent that raised the blocker reads to know
// what was decided, bought or approved, so "done" is worth less than the answer itself.
//
// An agent is refused. Agents raise blockers and people end them (docs/design.md §6).

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { blockerLine } from "../lib/format.mts";
import { ref } from "../lib/ref.mts";

export const name = "resolve";
export const summary = "end a blocker, and free every issue it holds";

export type Parsed = { action: "help" } | { action: "resolve"; args: { id: string; note: string } };

const USAGE = "cn resolve <bl-id> --note <what happened>";

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help"], value: ["note"] });
  if (opts.help) return { action: "help" };
  const [id, ...rest] = pos;
  if (!id || rest.length > 0) throw new UsageError(USAGE);
  const note = typeof opts.note === "string" ? opts.note.trim() : "";
  if (!note) throw new UsageError(`${USAGE}: a resolution says what happened`);
  return { action: "resolve", args: { id, note } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const blocker = await client.mutation(api.blockers.resolve, {
    actor: actor(),
    ...parsed.args,
  });
  console.log(blockerLine(blocker));
  if (blocker.issues.length > 0) console.log(`  freed  ${blocker.issues.map(ref).join(", ")}`);
  return 0;
}
