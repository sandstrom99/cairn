// cn list — what is in the list, and where it stands.
//
//   cn list [--project <slug>] [--epic <ep-id>] [--status open|in_progress|closed|dropped]
//           [--mine] [--json]
//
// One line per issue, ordered by priority then age, each starting with the reference form.
// --mine is the issues claimed by this machine's actor (CAIRN_ACTOR, else <host>/<user>).
// Nothing is hidden: a deferred issue is still listed, because a list that goes quiet is
// how work disappears. What is *ready* to pick up is `cn ready`, which lands with the
// graph; this is the flat list.

import { parseArgs } from "../lib/args.mts";
import { ISSUE_STATUSES, maybe, oneOf } from "../lib/flags.mts";
import { actor } from "../lib/actor.mts";
import { usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine } from "../lib/lines.mts";

export const name = "list";
export const summary = "the issues, by priority then age";

export type ListArgs = {
  project?: string;
  epic?: string;
  status?: (typeof ISSUE_STATUSES)[number];
  claimedBy?: string;
};

export type Parsed = { action: "help" } | { action: "list"; json: boolean; args: ListArgs };

/** `me` is the actor --mine means; run passes this machine's. */
export function parse(argv: string[], me: string): Parsed {
  const { opts } = parseArgs(argv, {
    bool: ["help", "json", "mine"],
    value: ["project", "epic", "status"],
  });
  if (opts.help) return { action: "help" };
  return {
    action: "list",
    json: opts.json,
    args: {
      ...maybe("project", opts.project),
      ...maybe("epic", opts.epic),
      ...maybe("status", oneOf(opts.status, "status", ISSUE_STATUSES)),
      ...maybe("claimedBy", opts.mine ? me : undefined),
    },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv, actor().name);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const issues = await client.query(api.issues.list, parsed.args);
  if (parsed.json) console.log(JSON.stringify(issues, null, 2));
  else if (issues.length > 0) console.log(issues.map(issueLine).join("\n"));
  return 0;
}
