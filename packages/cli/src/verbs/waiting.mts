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
// Friday is seen the next time somebody asks. The count is what `cn brief` opens a
// session with, as `waiting on you`.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyFlags } from "../lib/flags.mts";
import { answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { blockerLine, holdsLine } from "../lib/lines.mts";

export const name = "waiting";
export const summary = "what waits on a person: every unresolved blocker, and what it holds";
export const spec = { bool: ["json"] } as const satisfies ArgSpec;

type Parsed = { action: "waiting"; json: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  onlyFlags(pos, "cn waiting [--json]");
  return { action: "waiting", json: opts.json };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client } = connect();
  const blockers = await client.query(api.blockers.list, {});
  answer(parsed.json, blockers, (all) =>
    all.flatMap((b) => [blockerLine(b), ...(b.issues.length > 0 ? [holdsLine(b.issues)] : [])]),
  );
  return 0;
}
