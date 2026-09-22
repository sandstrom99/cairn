// cn claim — take an issue, first writer wins.
//
//   cn claim <id>
//
// Sets it in progress and writes this machine's actor on it. There is no lease and no
// TTL: a claim is a cooperative signal, not a lock. Nothing releases a claim on its own; a
// silent one is a line in the brief and in cn review, and a person releases it. Claiming
// what you already hold changes nothing, so it is safe to repeat.
//
// A second actor is not told it is stale — it is told who holds the issue and since when,
// which is what it needs to decide whether to wait, ask, or take something else.

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine } from "../lib/format.mts";

export const name = "claim";
export const summary = "take an issue: first writer wins, no lease";

export type Parsed = { action: "help" } | { action: "claim"; args: { id: string } };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help"] });
  if (opts.help) return { action: "help" };
  const [id, ...rest] = pos;
  if (!id || rest.length > 0) throw new UsageError("cn claim <id>");
  return { action: "claim", args: { id } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const issue = await client.mutation(api.issues.claim, { actor: actor(), ...parsed.args });
  console.log(issueLine(issue));
  return 0;
}
