// cn release — give an issue back.
//
//   cn release <id>
//
// Clears the claim and puts it back to open. An agent may only release what it holds; a
// person may release anything, which is how a session that died mid-claim gets unstuck:
// nothing else releases it. Releasing what nobody holds changes nothing.

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine } from "../lib/lines.mts";

export const name = "release";
export const summary = "give an issue back: open again, claim cleared";

export type Parsed = { action: "help" } | { action: "release"; args: { id: string } };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help"] });
  if (opts.help) return { action: "help" };
  const [id, ...rest] = pos;
  if (!id || rest.length > 0) throw new UsageError("cn release <id>");
  return { action: "release", args: { id } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const issue = await client.mutation(api.issues.release, { actor: actor(), ...parsed.args });
  console.log(issueLine(issue));
  return 0;
}
