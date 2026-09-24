// cn epic — the outcomes issues belong to.
//
//   cn epic new <title> [--description <text>]             create an epic, mints ep-N
//   cn epic list [--all] [--json]                          open epics, a health block each
//   cn epic close <id> --revision N                        the outcome is reached
//   cn epic close <id> --revision N --drop --reason <why>  it is not going to happen
//
// An epic is an outcome, not a place: it belongs to no project, and an issue in it may
// come from any. ep-0 "Inbox" is where an issue goes when no epic fits, and it is created
// on first use. The counts are tasks — open, in progress, done — with open follow-ups
// beside them rather than inside them, so residue cannot dilute progress.
//
// `list` prints a health block per epic (docs/design.md §8): the counts, then what is
// moving, what has been stuck longest, and what waits on a person. Never a percentage.
//
// `close` is refused while a task in the epic is open, and names every one of them. An
// open follow-up does not refuse it: residue is routed work, and `cn ready` still lists
// it. `--drop --reason` is the other ending, and it drops every live issue in the epic
// with that reason first, so nothing is left pointing at an epic nobody will finish.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { maybe, onlyFlags, onlyId, revision } from "../lib/flags.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { epicClosedLines, healthLines } from "../lib/lines.mts";
import { ref } from "../lib/ref.mts";

export const name = "epic";
export const summary = "the outcomes issues belong to";
export const spec = {
  bool: ["json", "all", "drop"],
  value: ["description", "revision", "reason"],
} as const satisfies ArgSpec;

type Parsed =
  | { action: "new"; args: { title: string; description?: string } }
  | { action: "list"; json: boolean; args: { all?: boolean } }
  | {
      action: "close";
      args: { id: string; revision: number; drop?: true; reason?: string };
    };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  const [action, ...rest] = pos;
  if (action === "list") {
    onlyFlags(rest, "cn epic list [--all] [--json]");
    return { action: "list", json: opts.json, args: opts.all ? { all: true } : {} };
  }
  if (action === "close") {
    const id = onlyId(rest, "cn epic close <id> --revision N [--drop --reason <why>]");
    const rev = revision(opts.revision, "cn epic close <id> --revision N");
    // Dropping is the only ending that takes a reason, so a reason alone is a typo for it,
    // and a drop without one is refused here as `cn drop` refuses it: why not?
    if (opts.reason !== undefined && !opts.drop)
      throw new UsageError("--reason goes with --drop; a close that reaches the outcome has none");
    if (opts.drop && (opts.reason ?? "").trim() === "")
      throw new UsageError("cn epic close <id> --revision N --drop --reason <why>: why not?");
    return {
      action: "close",
      args: {
        id,
        revision: rev,
        ...(opts.drop ? { drop: true as const } : {}),
        ...maybe("reason", opts.reason),
      },
    };
  }
  if (action !== "new") throw new UsageError(`cn epic new|list|close, not "${action ?? ""}"`);
  const title = rest.join(" ").trim();
  if (!title) throw new UsageError("cn epic new <title> [--description <text>]");
  return { action: "new", args: { title, ...maybe("description", opts.description) } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client } = connect();
  if (parsed.action === "new") {
    console.log(ref(await client.mutation(api.epics.create, { actor: actor(), ...parsed.args })));
    return 0;
  }
  if (parsed.action === "close") {
    console.log(
      epicClosedLines(
        await client.mutation(api.epics.close, { actor: actor(), ...parsed.args }),
      ).join("\n"),
    );
    return 0;
  }
  const epics = await client.query(api.epics.list, parsed.args);
  // A health block per epic, a blank line between them.
  answer(parsed.json, epics, (all) =>
    all.flatMap((e, i) => (i === 0 ? [] : [""]).concat(healthLines(e))),
  );
  return 0;
}
