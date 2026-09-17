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

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { healthLines } from "../lib/format.mts";
import { ref } from "../lib/ref.mts";

export const name = "epic";
export const summary = "the outcomes issues belong to";

export type Parsed =
  | { action: "help" }
  | { action: "new"; args: { title: string; description?: string } }
  | { action: "list"; json: boolean; args: { all?: boolean } }
  | {
      action: "close";
      args: { id: string; revision: number; drop?: true; reason?: string };
    };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, {
    bool: ["help", "json", "all", "drop"],
    value: ["description", "revision", "reason"],
  });
  if (opts.help) return { action: "help" };
  const [action, ...rest] = pos;
  if (action === "list")
    return { action: "list", json: Boolean(opts.json), args: opts.all ? { all: true } : {} };
  if (action === "close") {
    const [id, ...extra] = rest;
    if (!id || extra.length > 0)
      throw new UsageError("cn epic close <id> --revision N [--drop --reason <why>]");
    const given = typeof opts.revision === "string" ? opts.revision : undefined;
    const revision = Number(given);
    if (given === undefined || !Number.isInteger(revision))
      throw new UsageError("cn epic close <id> --revision N: the revision cn last printed for it");
    const reason = typeof opts.reason === "string" ? opts.reason : undefined;
    // Dropping is the only ending that takes a reason, so a reason alone is a typo for it.
    if (reason !== undefined && !opts.drop)
      throw new UsageError("--reason goes with --drop; a close that reaches the outcome has none");
    return {
      action: "close",
      args: {
        id,
        revision,
        ...(opts.drop ? { drop: true as const } : {}),
        ...(reason === undefined ? {} : { reason }),
      },
    };
  }
  if (action !== "new") throw new UsageError(`cn epic new|list|close, not "${action ?? ""}"`);
  const title = rest.join(" ").trim();
  if (!title) throw new UsageError("cn epic new <title> [--description <text>]");
  return {
    action: "new",
    args: {
      title,
      ...(typeof opts.description === "string" ? { description: opts.description } : {}),
    },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  if (parsed.action === "new") {
    console.log(ref(await client.mutation(api.epics.create, { actor: actor(), ...parsed.args })));
    return 0;
  }
  if (parsed.action === "close") {
    const { epic, dropped } = await client.mutation(api.epics.close, {
      actor: actor(),
      ...parsed.args,
    });
    if (parsed.args.drop) {
      console.log(`${ref(epic)} dropped r${epic.revision}`);
      for (const issue of dropped) console.log(`  dropped  ${ref(issue)}`);
    } else {
      console.log(`${ref(epic)} closed r${epic.revision}`);
      if (epic.counts.followUps > 0)
        console.log(
          `  ${epic.counts.followUps} follow-up${epic.counts.followUps === 1 ? "" : "s"} still open`,
        );
    }
    return 0;
  }
  const epics = await client.query(api.epics.list, parsed.args);
  if (parsed.json) console.log(JSON.stringify(epics, null, 2));
  else if (epics.length > 0) console.log(epics.map((e) => healthLines(e).join("\n")).join("\n\n"));
  return 0;
}
