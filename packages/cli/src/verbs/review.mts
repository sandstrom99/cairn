// cn review — what a person and an agent should look at together, in one epic.
//
//   cn review <epic> [--json]
//
// One read, and it writes nothing: every line is a fact, and what to do about it is
// left to the two reading it, through the verbs that exist. Running it twice reads the
// same. The lines, each in the reference form:
//
//   near        two live issues whose titles are near-identical
//   inbox       an item in ep-0 for more than 7 days
//   nudge       a blocker past the day it said to look again
//   silent      a claim with no activity for 24 hours; nothing releases it
//   unverified  a close marked --unverified with no follow-up beside it
//   edge        a blocks edge with a finished end; it holds nothing and stays as history
//   can close   every issue is finished, so the cn epic close line to run
//
// With nothing to look at it prints the epic and `nothing to look at`.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyId } from "../lib/flags.mts";
import { UsageError, answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { reviewLines } from "../lib/lines.mts";

export const name = "review";
export const summary = "what to look at in one epic, together; writes nothing";
export const spec = { bool: ["json"] } as const satisfies ArgSpec;

export type Parsed = { action: "review"; id: string; json: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);

  const id = onlyId(pos, "cn review <epic> [--json]");
  // One epic at a time, and an epic is the only thing a sitting reads: an issue id here
  // is a typo for `cn show`.
  if (!id.startsWith("ep-")) throw new UsageError(`cn review takes an epic, not "${id}"`);

  return { action: "review", id, json: opts.json };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client } = connect();
  const view = await client.query(api.review.get, { id: parsed.id });
  answer(parsed.json, view, (v) => reviewLines(v));
  return 0;
}
