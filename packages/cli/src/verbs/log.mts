// cn log — what happened across the deployment, newest first.
//
//   cn log [--limit N] [--before <date>] [--json]
//
// One line per event: what it happened to in the reference form, the event, who did it,
// how long ago, and what changed. `cn show <id> --history` is one issue's story; this is
// everybody's — who claimed, closed or raised what, across every epic.
//
// --limit is how many, 1 to 200; without it the deployment decides, which is 50 today.
// --before is a date, anything Date.parse takes, and lists only what happened before it:
// pass the time of the oldest line you have to read further back.
//
// Every event reads as a line, never as JSON. A create prints no payload, because the
// reference at the start of its line already names what was created, except a project,
// which has no reference to lead with and prints as `cn "cairn"`. A journal entry prints
// as `finding: <its first line>`. An edge prints once, on the end that leads its sentence,
// `cn-2 "…"  edge.add  …  blocked by cn-1`, though both ends' histories carry it. A
// blocker's raise is the blocker's own line on the issue it was raised on, `bl-1 "…"
// decision · owner balder`, an attach `waits on bl-1`, and the resolve that freed an issue
// is the blocker and the note, `bl-1 "…": done`. A lifecycle move is its fields,
// `status open → in_progress`.
//
// An empty deployment prints nothing and exits 0.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { date, integer, maybe, onlyFlags } from "../lib/flags.mts";
import { answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { logLine } from "../lib/lines.mts";

export const name = "log";
export const summary = "what happened across the deployment, newest first";
export const spec = { bool: ["json"], value: ["limit", "before"] } as const satisfies ArgSpec;

export type Parsed = { action: "log"; limit?: number; before?: number; json: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  onlyFlags(pos, "cn log [--limit N] [--before <date>] [--json]");
  return {
    action: "log",
    ...maybe("limit", integer(opts.limit, "limit", 1, 200)),
    ...maybe("before", date(opts.before, "before")),
    json: opts.json,
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client } = connect();
  const { limit, before } = parsed;
  const events = await client.query(api.events.recent, {
    ...(limit === undefined ? {} : { limit }),
    ...(before === undefined ? {} : { before }),
  });
  answer(parsed.json, events, (all) => all.map((e) => logLine(e)));
  return 0;
}
