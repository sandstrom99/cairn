// cn drop — closed without doing, and why.
//
//   cn drop <id> --revision N --reason <text>
//
// Kept distinct from `close` so rollups stay honest: a dropped issue is not work that got
// done. The reason is required and there is no way around it — closed-without-doing
// should never be silent, because the next session's first question is why.

import { parseArgs } from "../lib/args.mts";
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

  const [id, ...rest] = pos;
  if (!id || rest.length > 0) throw new UsageError("cn drop <id> --revision N --reason <text>");

  const given = typeof opts.revision === "string" ? opts.revision : undefined;
  const revision = Number(given);
  if (given === undefined || !Number.isInteger(revision))
    throw new UsageError("cn drop <id> --revision N: the revision cn last printed for it");

  const reason = typeof opts.reason === "string" ? opts.reason.trim() : "";
  if (!reason) throw new UsageError("cn drop <id> --revision N --reason <text>: why not?");

  return { action: "drop", args: { id, revision, reason } };
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
