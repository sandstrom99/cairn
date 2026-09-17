// cn reconcile — tidy one epic: facts alone, judgement raised to a person.
//
//   cn reconcile <epic> [--owner <who>] [--json]
//
// Five rules act on their own, because each tests a fact and has one right answer:
//
//   reparented  an inbox issue whose parent or discovered-from sits in exactly one open
//               epic moves into it
//   released    a claim with no activity for 24 hours goes back to open
//   spawned     a close marked --unverified with no follow-up beside it gets one
//   dropped     a `blocks` edge into a closed or dropped issue is deleted
//   closed      an epic whose every issue is finished, follow-ups included, closes
//
// Three rules do not act, because the answer is a judgement and the wrong one loses work.
// Each becomes a human blocker addressed to --owner, and arrives through `cn waiting` like
// everything else waiting on a person:
//
//   raised      two live issues in the epic with near-identical titles
//   raised      an item sitting in ep-0 for more than 7 days
//   raised      a blocker past the `nudgeAt` date it was raised with
//
// It is idempotent. Every rule tests the state it would create, and every question has a
// deterministic title that is looked up before it is asked again, so a second run acts on
// nothing and a question a person has already resolved is never asked twice.
//
// Every write it makes is by `cairn/reconcile`, never by the session that ran it, so what
// it raised can be told from what an agent raised by hand. --owner is who those raises
// are addressed to, and defaults to CAIRN_OWNER, then this machine's username.

import { userInfo } from "node:os";
import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { reconcileLines } from "../lib/format.mts";

export const name = "reconcile";
export const summary = "tidy one epic: facts alone, judgement raised to a person";

export type Parsed =
  | { action: "help" }
  | { action: "run"; json: boolean; args: { id: string; owner: string } };

export function parse(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  username: () => string = () => userInfo().username,
): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help", "json"], value: ["owner"] });
  if (opts.help) return { action: "help" };

  const [id, ...rest] = pos;
  if (!id || rest.length > 0) throw new UsageError("cn reconcile <epic> [--owner <who>] [--json]");
  // One epic at a time, and an epic is the only thing with rules to run over it: an issue
  // id here is a typo for `cn show`, and acting on the wrong id raises to the wrong person.
  if (!id.startsWith("ep-")) throw new UsageError(`cn reconcile takes an epic, not "${id}"`);

  const owner = (typeof opts.owner === "string" ? opts.owner : undefined) ?? env.CAIRN_OWNER;
  return {
    action: "run",
    json: Boolean(opts.json),
    args: { id, owner: owner ?? username() },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const result = await client.mutation(api.reconcile.run, { actor: actor(), ...parsed.args });
  if (parsed.json) console.log(JSON.stringify(result, null, 2));
  else console.log(reconcileLines(result, parsed.args.owner).join("\n"));
  return 0;
}
