// cn log — what happened across the deployment, newest first.
//
//   cn log [--limit N] [--before <date>] [--json]
//
// One line per event: what it happened to in the reference form, the event, who did it,
// how long ago, and what changed. `cn show <id> --history` is one issue's story; this is
// everybody's — who claimed, closed, raised or reconciled what, across every epic.
//
// --limit is how many, 1 to 200; without it the deployment decides, which is 50 today.
// --before is a date, anything Date.parse takes, and lists only what happened before it:
// pass the time of the oldest line you have to read further back. A create prints no
// payload, because the reference at the start of its line already names what was
// created; a journal entry prints as `finding: <its first line>`; an edge prints once, on
// the end that leads its sentence, `cn-2 "…"  edge.add  …  blocked by cn-1`, though both
// ends' histories carry it.
//
// An empty deployment prints nothing and exits 0.

import { parseArgs } from "../lib/args.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { logLine } from "../lib/format.mts";

export const name = "log";
export const summary = "what happened across the deployment, newest first";

export type Parsed =
  | { action: "help" }
  | { action: "log"; limit?: number; before?: number; json: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help", "json"], value: ["limit", "before"] });
  if (opts.help) return { action: "help" };
  if (pos.length > 0) throw new UsageError("cn log [--limit N] [--before <date>] [--json]");

  const givenLimit = typeof opts.limit === "string" ? opts.limit : undefined;
  const limit = givenLimit === undefined ? undefined : Number(givenLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200))
    throw new UsageError(`--limit is a whole number from 1 to 200, not "${givenLimit}"`);

  const givenBefore = typeof opts.before === "string" ? opts.before : undefined;
  const before = givenBefore === undefined ? undefined : Date.parse(givenBefore);
  if (givenBefore !== undefined && Number.isNaN(before))
    throw new UsageError(`--before is a date, not "${givenBefore}"`);

  return {
    action: "log",
    ...(limit === undefined ? {} : { limit }),
    ...(before === undefined ? {} : { before }),
    json: Boolean(opts.json),
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const { limit, before } = parsed;
  const events = await client.query(api.events.recent, {
    ...(limit === undefined ? {} : { limit }),
    ...(before === undefined ? {} : { before }),
  });
  if (parsed.json) {
    console.log(JSON.stringify(events, null, 2));
    return 0;
  }
  for (const e of events) console.log(logLine(e));
  return 0;
}
