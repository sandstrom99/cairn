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

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, say, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";

export const name = "journal";
export const summary = "record what happened: an entry that cannot conflict";

const KINDS = ["finding", "decision", "handoff", "evidence", "question"] as const;

export type JournalArgs = {
  id: string;
  kind: (typeof KINDS)[number];
  body: string;
};

export type Parsed = { action: "help" } | { action: "journal"; args: JournalArgs };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help"], value: ["kind"] });
  if (opts.help) return { action: "help" };

  const [id, ...rest] = pos;
  if (!id) throw new UsageError("cn journal <id> --kind finding <body…>");
  const kind = typeof opts.kind === "string" ? opts.kind : undefined;
  if (kind === undefined || !KINDS.includes(kind as (typeof KINDS)[number]))
    throw new UsageError(`--kind is one of ${KINDS.join(", ")}, not "${kind ?? ""}"`);
  // The body is the rest of the line, so an entry needs no quoting to be written.
  const body = rest.join(" ").trim();
  if (!body) throw new UsageError("cn journal <id> --kind finding <body…>: the body is missing");
  return { action: "journal", args: { id, kind: kind as (typeof KINDS)[number], body } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const entry = await client.mutation(api.journal.append, { actor: actor(), ...parsed.args });
  // Nothing on stdout: the entry is the answer and it is already stored, so a pipeline
  // reading this verb would only be reading back what it wrote.
  say(`${entry.kind} recorded on ${entry.id}`);
  return 0;
}
