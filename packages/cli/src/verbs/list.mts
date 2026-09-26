// cn list — what is in the list, and where it stands.
//
//   cn list [--project <slug>] [--epic <ep-id>] [--status open|in_progress|closed|dropped]
//           [--mine] [--silent <duration>] [--blocked] [--json]
//
// One line per issue, ordered by priority then age, each starting with the reference form.
// --mine is the issues claimed under this machine's actor name: CAIRN_ACTOR, else
// <host>/claude in a Claude Code session and <host>/<user> at a terminal (lib/actor.mts).
// --silent 3d is what nobody has touched for that long, as 90m, 36h or 3d, each line
// ending `· silent 4d`; --blocked is what a live blocks edge holds, each line ending
// `· blocked by cn-1 "…"`. Both read live issues unless --status says otherwise, since a
// closed issue is silent and past holding by nature, and both compose with every other
// flag. Nothing is hidden otherwise: a deferred issue is still listed, because a list that
// goes quiet is how work disappears. What is *ready* to pick up is `cn ready`; this is
// the flat list.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { ISSUE_STATUSES, duration, maybe, oneOf, onlyFlags } from "../lib/flags.mts";
import { answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { listLine } from "../lib/lines.mts";

export const name = "list";
export const summary = "the issues, by priority then age";
export const spec = {
  bool: ["json", "mine", "blocked"],
  value: ["project", "epic", "status", "silent"],
} as const satisfies ArgSpec;

type ListArgs = {
  project?: string;
  epic?: string;
  status?: (typeof ISSUE_STATUSES)[number];
  claimedBy?: string;
  silentFor?: number;
  blocked?: boolean;
};

type Parsed = { action: "list"; json: boolean; args: ListArgs };

/** `me` is the actor --mine means; run passes this session's. */
export function parse(argv: string[], me: string): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  onlyFlags(
    pos,
    "cn list [--project <slug>] [--epic <ep-id>] [--status …] [--mine] [--silent <duration>] [--blocked] [--json]",
  );
  return {
    action: "list",
    json: opts.json,
    args: {
      ...maybe("project", opts.project),
      ...maybe("epic", opts.epic),
      ...maybe("status", oneOf(opts.status, "status", ISSUE_STATUSES)),
      ...maybe("claimedBy", opts.mine ? me : undefined),
      ...maybe("silentFor", duration(opts.silent, "silent")),
      ...maybe("blocked", opts.blocked ? true : undefined),
    },
  };
}

export async function run(argv: string[]): Promise<number> {
  const { client, actor } = connect();
  const parsed = parse(argv, actor.name);
  const issues = await client.query(api.issues.list, parsed.args);
  answer(parsed.json, issues, (all) => all.map((i) => listLine(i)));
  return 0;
}
