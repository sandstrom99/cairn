// cn ready — what can be picked up right now.
//
//   cn ready [--json]
//
// An issue is ready when it is open, nothing open blocks it, no unresolved human blocker
// is attached, and its defer date has passed — ordered by priority, then age, with the
// rows the brief names stuck after the rest. It is computed live on every call: the
// moment a blocker closes, what it held is ready, with no recompute step in between.
//
// An issue in progress is somebody's claim, not ready work, so it is not here; `cn list`
// is the flat view of everything.
//
// Nothing is filtered by who asks. Work only some machine can do, a phone or one host,
// says so in its own title or description, and the session reading the list decides.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyFlags } from "../lib/flags.mts";
import { answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine } from "../lib/lines.mts";

export const name = "ready";
export const summary = "what can be picked up right now";
export const spec = { bool: ["json"] } as const satisfies ArgSpec;

type Parsed = { action: "ready"; json: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  onlyFlags(pos, "cn ready [--json]");
  return { action: "ready", json: opts.json };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client } = connect();
  const issues = await client.query(api.ready.list, {});
  answer(parsed.json, issues, (all) => all.map((i) => issueLine(i)));
  return 0;
}
