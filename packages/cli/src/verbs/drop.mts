// cn drop — closed without doing, and why.
//
//   cn drop <id> --revision N --reason <text>
//
// Kept distinct from `close` so rollups stay honest: a dropped issue is not work that got
// done. The reason is required and there is no way around it — closed-without-doing
// should never be silent, because the next session's first question is why.

import { parseArgs } from "../lib/args.mts";
import { onlyId, revision } from "../lib/flags.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine } from "../lib/lines.mts";

export const name = "drop";
export const summary = "closed without doing, with the reason it was not";

export type Parsed =
  | { action: "help" }
  | { action: "drop"; args: { id: string; revision: number; reason: string } };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help"], value: ["revision", "reason"] });
  if (opts.help) return { action: "help" };

  const id = onlyId(pos, "cn drop <id> --revision N --reason <text>");
  const rev = revision(opts.revision, "cn drop <id> --revision N");

  const reason = opts.reason?.trim() ?? "";
  if (!reason) throw new UsageError("cn drop <id> --revision N --reason <text>: why not?");

  return { action: "drop", args: { id, revision: rev, reason } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const issue = await client.mutation(api.issues.drop, { actor: actor(), ...parsed.args });
  console.log(issueLine(issue));
  return 0;
}
