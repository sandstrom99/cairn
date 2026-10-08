// cn epic — the outcomes issues belong to.
//
//   cn epic new <title> --done-when <text> [--description <text>] [--link <url>…]  an outcome, mints ep-N
//   cn epic new <title> --stream [--description <text>] [--link <url>…]            a stream, an intake that never closes
//   cn epic list [--all] [--json]                               open epics, a health block each
//   cn epic close <id> --revision N                             the outcome is reached
//   cn epic close <id> --revision N --drop --reason <why>       it is not going to happen
//   cn epic close <id> --revision N --carry-to <ep-id>          reached; its open tasks move into ep-id
//
// `--description` is Markdown and takes `@-` or `@path` like `cn create`'s. `--link` is a
// link as `cn create --help` says, and repeats; an epic's plan doc is the usual one.
//
// An epic is not a place: it belongs to no project, and an issue in it may come from any.
// ep-0 "Inbox" is where an issue goes when no epic fits, and it is created on first use.
// The counts are tasks — open, in progress, done — with open follow-ups beside them rather
// than inside them, so residue cannot dilute progress.
//
// An epic is an outcome or a stream. An outcome names its end state in the title and says
// in `--done-when` what being reached means, as an issue has its verification. A stream
// names the flow and its duty ("Scout findings, each fixed or decided"), is never closed,
// and its head counts the last 28 days rather than an all-time done. ep-0 is a stream.
//
// `list` prints a health block per epic (docs/design.md §8): the counts, then what is
// moving, what is stuck past its priority's limit, and what waits on a person. Never a
// percentage.
//
// `close` is refused while a task in the epic is open, and names every one of them. An
// open follow-up does not refuse it: residue is routed work, and `cn ready` still lists
// it. `close` is refused on a stream. `--drop --reason` is the other ending, for a stream
// as for an outcome, and it drops every live issue in the epic with that reason first, so
// nothing is left pointing at an epic nobody will finish.
//
// An outcome is often reached with a few tasks left that belong to something next door.
// `--carry-to` moves every open and in-progress task into that epic and closes this one
// in one write: each issue's history reads the move, both epics name the carry, and a
// claim survives it. Follow-ups stay, as on any close.

import type { LinkInput } from "@cairn/backend/convex/lib/links.js";
import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { links, maybe, onlyFlags, onlyId, revision, text } from "../lib/flags.mts";
import { UsageError, answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { epicClosedLines, healthLines } from "../lib/lines.mts";
import { ref } from "../lib/ref.mts";

export const name = "epic";
export const summary = "the outcomes issues belong to";
export const spec = {
  bool: ["json", "all", "drop", "stream"],
  value: ["description", "done-when", "revision", "reason", "carry-to"],
  list: ["link"],
} as const satisfies ArgSpec;

type Parsed =
  | {
      action: "new";
      args: {
        title: string;
        type?: "stream";
        doneWhen?: string;
        description?: string;
        link?: LinkInput[];
      };
    }
  | { action: "list"; json: boolean; args: { all?: boolean } }
  | {
      action: "close";
      args: { id: string; revision: number; drop?: true; reason?: string; carryTo?: string };
    };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  const [action, ...rest] = pos;
  if (action === "list") {
    onlyFlags(rest, "cn epic list [--all] [--json]");
    return { action: "list", json: opts.json, args: opts.all ? { all: true } : {} };
  }
  if (action === "close") {
    const id = onlyId(
      rest,
      "cn epic close <id> --revision N [--carry-to <ep-id> | --drop --reason <why>]",
    );
    const rev = revision(opts.revision, "cn epic close <id> --revision N");
    // Dropping is the only ending that takes a reason, so a reason alone is a typo for it,
    // and a drop without one is refused here as `cn drop` refuses it: why not?
    if (opts.reason !== undefined && !opts.drop)
      throw new UsageError("--reason goes with --drop; a close that reaches the outcome has none");
    if (opts.drop && opts["carry-to"] !== undefined)
      throw new UsageError(
        "--carry-to goes with a close, not --drop; a drop takes the work with it",
      );
    if (opts.drop && (opts.reason ?? "").trim() === "")
      throw new UsageError("cn epic close <id> --revision N --drop --reason <why>: why not?");
    return {
      action: "close",
      args: {
        id,
        revision: rev,
        ...(opts.drop ? { drop: true as const } : {}),
        ...maybe("reason", opts.reason),
        ...maybe("carryTo", opts["carry-to"]),
      },
    };
  }
  if (action !== "new") throw new UsageError(`cn epic new|list|close, not "${action ?? ""}"`);
  const title = rest.join(" ").trim();
  if (!title) throw new UsageError("cn epic new <title> --done-when <text> | --stream");
  // Whether the type and the done-when go together is the deployment's to say.
  return {
    action: "new",
    args: {
      title,
      ...(opts.stream ? { type: "stream" as const } : {}),
      ...maybe("doneWhen", opts["done-when"]),
      ...maybe("description", text(opts.description, "--description")),
      ...maybe("link", links(opts.link)),
    },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client, actor } = connect();
  if (parsed.action === "new") {
    console.log(ref(await client.mutation(api.epics.create, { actor, ...parsed.args })));
    return 0;
  }
  if (parsed.action === "close") {
    console.log(
      epicClosedLines(await client.mutation(api.epics.close, { actor, ...parsed.args })).join("\n"),
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
