// cn resolve — end a blocker, and free every issue it holds.
//
//   cn resolve <bl-id> --note <what happened> [--said <what the person said>]
//
// The issues come back into `cn ready` immediately, with nothing recomputed in between:
// readiness is asked live on every call, so resolving here is the whole of it.
//
// The note is the record. It is what the agent that raised the blocker reads to know
// what was decided, bought or approved, so "done" is worth less than the answer itself.
//
// An agent resolves only on the person's word: `--said` carries what they said, verbatim,
// and `cn show` and `cn log` quote it beside the note. Without it an agent is refused; a
// person's own `cn resolve` needs no `--said` (docs/design.md §6).

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyId } from "../lib/flags.mts";
import { UsageError } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { blockerLine, freedLine } from "../lib/lines.mts";

export const name = "resolve";
export const summary = "end a blocker, and free every issue it holds";
export const spec = { value: ["note", "said"] } as const satisfies ArgSpec;

type Parsed = { action: "resolve"; args: { id: string; note: string; said?: string } };

const USAGE = "cn resolve <bl-id> --note <what happened> [--said <what the person said>]";

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  const id = onlyId(pos, USAGE);
  const note = opts.note?.trim() ?? "";
  if (!note) throw new UsageError(`${USAGE}: a resolution says what happened`);
  const said = opts.said?.trim();
  return { action: "resolve", args: { id, note, ...(said ? { said } : {}) } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client, actor } = connect();
  const blocker = await client.mutation(api.blockers.resolve, {
    actor,
    ...parsed.args,
  });
  console.log(blockerLine(blocker));
  if (blocker.issues.length > 0) console.log(freedLine(blocker.issues));
  return 0;
}
