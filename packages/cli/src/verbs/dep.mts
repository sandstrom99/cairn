// cn dep — link two issues, one direction stored.
//
//   cn dep add <id> --blocked-by <other>        the other must finish first
//   cn dep add <id> --blocks <other>            this one must finish first
//   cn dep add <id> --related <other>           context, either way round
//   cn dep add <id> --discovered-from <other>   this one came out of that one
//   cn dep add <id> --duplicates <other>
//   cn dep add <id> --supersedes <other>
//   cn dep rm  <id> <the same flag> <other>     removes exactly that edge
//
// Exactly one relation per call. `--blocked-by X` on Y and `--blocks Y` on X write the
// same single row, X blocks Y: `blocked-by` is that row read the other way, and nothing
// ever stores both directions. Removing takes the direction you added, or either of the
// two spellings of it.
//
// Only `blocks` touches readiness, and an edge that would make an issue block itself is
// refused with the path it found, because a cycle makes both ends unready forever.
// Adding the same edge twice changes nothing.

import { parseArgs } from "../lib/args.mts";
import { onlyId } from "../lib/flags.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { edgeLine } from "../lib/lines.mts";

export const name = "dep";
export const summary = "link two issues: blocked-by, blocks, related, discovered-from, …";

const RELATIONS = [
  "blocked-by",
  "blocks",
  "related",
  "discovered-from",
  "duplicates",
  "supersedes",
] as const;

export type EdgeType = "blocks" | "related" | "discovered-from" | "duplicates" | "supersedes";
export type EdgeArgs = { from: string; to: string; type: EdgeType };

export type Parsed = { action: "help" } | { action: "add" | "rm"; args: EdgeArgs };

const USAGE =
  "cn dep add|rm <id> --blocked-by|--blocks|--related|--discovered-from|--duplicates|--supersedes <other>";

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help"], value: RELATIONS });
  if (opts.help) return { action: "help" };

  const [action, ...rest] = pos;
  if (action !== "add" && action !== "rm") throw new UsageError(USAGE);
  const id = onlyId(rest, USAGE);

  const given = RELATIONS.filter((r) => opts[r] !== undefined);
  if (given.length !== 1)
    throw new UsageError(
      given.length === 0
        ? USAGE
        : `one relation per call, not ${given.map((r) => `--${r}`).join(" and ")}`,
    );
  const relation = given[0]!;
  const other = opts[relation]!;

  // One row per relation: the only question is which end is `from`.
  const args: EdgeArgs =
    relation === "blocked-by"
      ? { from: other, to: id, type: "blocks" }
      : { from: id, to: other, type: relation };
  return { action, args };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const fn = parsed.action === "add" ? api.edges.add : api.edges.remove;
  console.log(edgeLine(await client.mutation(fn, { actor: actor(), ...parsed.args })));
  return 0;
}
