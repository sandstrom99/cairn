// cn journal — record what happened, in the issue's own history.
//
//   cn journal <id> --kind finding|decision|handoff|evidence|question <body…>
//
// An append is an insert: it takes no revision, it cannot conflict, and it always lands.
// It stamps the issue's lastActivity, so a long claim heartbeats for free.
//
//   finding    what turned out to be true
//   decision   what was chosen, and what it rules out
//   handoff    where this stands for whoever picks it up next
//   evidence   proof from somewhere cn could not run: a device, another machine
//   question   what has to be answered before this can finish
//
// Proof that ran elsewhere goes in as `evidence` and the close points at it with
// --unverified; proof cn can run itself goes in `cn close --run`.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { JOURNAL_KINDS, need, oneOf } from "../lib/flags.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, say } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";

export const name = "journal";
export const summary = "record what happened: an entry that cannot conflict";
export const spec = { value: ["kind"] } as const satisfies ArgSpec;

type JournalArgs = {
  id: string;
  kind: (typeof JOURNAL_KINDS)[number];
  body: string;
};

type Parsed = { action: "journal"; args: JournalArgs };

const USAGE = "cn journal <id> --kind finding <body…>";

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);

  const [id, ...rest] = pos;
  if (!id) throw new UsageError(USAGE);
  const kind = need(oneOf(opts.kind, "kind", JOURNAL_KINDS), USAGE);
  // The body is the rest of the line, so an entry needs no quoting to be written.
  const body = rest.join(" ").trim();
  if (!body) throw new UsageError(`${USAGE}: the body is missing`);
  return { action: "journal", args: { id, kind, body } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client } = connect();
  const entry = await client.mutation(api.journal.append, { actor: actor(), ...parsed.args });
  // Nothing on stdout: the entry is the answer and it is already stored, so a pipeline
  // reading this verb would only be reading back what it wrote.
  say(`${entry.kind} recorded on ${entry.id}`);
  return 0;
}
