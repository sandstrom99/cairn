// cn epic — the outcomes issues belong to.
//
//   cn epic new <title> [--description <text>]    create an epic, mints ep-N
//   cn epic list [--all] [--json]                 open epics, with their counts
//
// An epic is an outcome, not a place: it belongs to no project, and an issue in it may
// come from any. ep-0 "Inbox" is where an issue goes when no epic fits, and it is created
// on first use. The counts are tasks — open, in progress, done — with open follow-ups
// beside them rather than inside them, so residue cannot dilute progress.

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { epicLine } from "../lib/format.mts";
import { ref } from "../lib/ref.mts";

export const name = "epic";
export const summary = "the outcomes issues belong to";

export type Parsed =
  | { action: "help" }
  | { action: "new"; args: { title: string; description?: string } }
  | { action: "list"; json: boolean; args: { all?: boolean } };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, {
    bool: ["help", "json", "all"],
    value: ["description"],
  });
  if (opts.help) return { action: "help" };
  const [action, ...rest] = pos;
  if (action === "list")
    return { action: "list", json: Boolean(opts.json), args: opts.all ? { all: true } : {} };
  if (action !== "new") throw new UsageError(`cn epic new|list, not "${action ?? ""}"`);
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
  const epics = await client.query(api.epics.list, parsed.args);
  if (parsed.json) console.log(JSON.stringify(epics, null, 2));
  else if (epics.length > 0) console.log(epics.map(epicLine).join("\n"));
  return 0;
}
