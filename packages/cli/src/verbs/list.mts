// cn list — what is in the list, and where it stands.
//
//   cn list [--project <slug>] [--epic <ep-id>] [--status open|in_progress|closed|dropped]
//           [--mine] [--json]
//
// One line per issue, ordered by priority then age, each starting with the reference form.
// --mine is the issues claimed under this machine's actor name: CAIRN_ACTOR, else
// <host>/claude in a Claude Code session and <host>/<user> at a terminal (lib/actor.mts).
// Nothing is hidden: a deferred issue is still listed, because a list that goes quiet is
// how work disappears. What is *ready* to pick up is `cn ready`; this is the flat list.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { ISSUE_STATUSES, maybe, oneOf, onlyFlags } from "../lib/flags.mts";
import { actor } from "../lib/actor.mts";
import { answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine } from "../lib/lines.mts";

export const name = "list";
export const summary = "the issues, by priority then age";
export const spec = {
  bool: ["json", "mine"],
  value: ["project", "epic", "status"],
} as const satisfies ArgSpec;

type ListArgs = {
  project?: string;
  epic?: string;
  status?: (typeof ISSUE_STATUSES)[number];
  claimedBy?: string;
};

type Parsed = { action: "list"; json: boolean; args: ListArgs };

/** `me` is the actor --mine means; run passes this machine's. */
export function parse(argv: string[], me: string): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  onlyFlags(pos, "cn list [--project <slug>] [--epic <ep-id>] [--status …] [--mine] [--json]");
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
  const { client } = connect();
  const issues = await client.query(api.issues.list, parsed.args);
  answer(parsed.json, issues, (all) => all.map((i) => issueLine(i)));
  return 0;
}
