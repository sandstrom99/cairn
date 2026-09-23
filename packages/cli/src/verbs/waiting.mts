// cn waiting — what waits on a person.
//
//   cn waiting [--json]
//
// Every unresolved blocker, raised first and acknowledged after, oldest first within
// each, with the issues each one holds. Raised before acknowledged because what nobody
// has looked at yet is what most needs looking at.
//
// Nothing waiting prints nothing and exits 0. This is the pull-only channel of
// docs/design.md §6: there is no push, no email and no mirror, so a blocker raised on
// Friday is seen the next time somebody asks. The count is what `cn brief` will open a
// session with.

import { parseArgs } from "../lib/args.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { blockerLine, holdsLine } from "../lib/lines.mts";

export const name = "waiting";
export const summary = "what waits on a person: every unresolved blocker, and what it holds";

export type Parsed = { action: "help" } | { action: "waiting"; json: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help", "json"] });
  if (opts.help) return { action: "help" };
  if (pos.length > 0) throw new UsageError("cn waiting [--json]");
  return { action: "waiting", json: opts.json };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const blockers = await client.query(api.blockers.list, {});
  if (parsed.json) {
    console.log(JSON.stringify(blockers, null, 2));
    return 0;
  }
  for (const blocker of blockers) {
    console.log(blockerLine(blocker));
    if (blocker.issues.length > 0) console.log(holdsLine(blocker.issues));
  }
  return 0;
}
