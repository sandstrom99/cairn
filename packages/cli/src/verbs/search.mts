// cn search — what the list already holds about a text.
//
//   cn search <text> [--project <slug>] [--status open|in_progress|closed|dropped] [--json]
//
// One line per issue whose title, description or a journal entry contains the text, case
// aside, in priority then age order, each marked with the field it was found in: `· in
// title`, `· in description` or `· in journal`, the first of those that holds it. Every
// status is searched unless --status narrows it, because what you are about to file may
// have been done or dropped already. The text is the words after the verb joined by one
// space, so `cn search connection retry` and `cn search "connection retry"` are the same
// search. Run it before `cn create`; a hit is the issue to build on, not a second one to
// file.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { ISSUE_STATUSES, maybe, oneOf } from "../lib/flags.mts";
import { UsageError, answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { searchLine } from "../lib/lines.mts";

export const name = "search";
export const summary = "the issues whose title, description or journal holds a text";
export const spec = { bool: ["json"], value: ["project", "status"] } as const satisfies ArgSpec;

type SearchArgs = { text: string; project?: string; status?: (typeof ISSUE_STATUSES)[number] };

type Parsed = { action: "search"; json: boolean; args: SearchArgs };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  // The text is the rest of the line, so a search of several words needs no quoting.
  const text = pos.join(" ").trim();
  if (text === "")
    throw new UsageError("cn search <text> [--project <slug>] [--status …] [--json]");
  return {
    action: "search",
    json: opts.json,
    args: {
      text,
      ...maybe("project", opts.project),
      ...maybe("status", oneOf(opts.status, "status", ISSUE_STATUSES)),
    },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client } = connect();
  const hits = await client.query(api.search.find, parsed.args);
  answer(parsed.json, hits, (all) => all.map((h) => searchLine(h)));
  return 0;
}
