// cn show — one id, and its neighbourhood.
//
//   cn show <id> [--history] [--json]
//
// The id says which: `ep-` an epic with its open issues, `bl-` a blocker with what it
// holds, anything else an issue. An issue's brief is about ten lines — its state, where
// it sits, the proof it closed on or the reason it was dropped, what it waits on, what
// waits on it, the first line of its description, design and acceptance, and its last
// five journal entries — because that is what a session needs before it starts and what
// it leaves behind when it stops. The status line opens with the state: `moving`, and
// who, `waiting`, `stuck`, `blocked`, `deferred until` a date, `closed`, `dropped`, or
// `open`. A `blocks` edge whose far end is finished reads `done`: it holds nothing back
// and stays as history. --history adds every event on it: what changed, who changed it
// and when, oldest first.

import { parseArgs } from "../lib/args.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { brief } from "../lib/format.mts";

export const name = "show";
export const summary = "one id, and its neighbourhood";

export type Parsed =
  | { action: "help" }
  | { action: "show"; json: boolean; args: { id: string; history?: boolean } };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help", "json", "history"] });
  if (opts.help) return { action: "help" };
  const [id, ...rest] = pos;
  if (!id || rest.length > 0) throw new UsageError("cn show <id> [--history] [--json]");
  return {
    action: "show",
    json: Boolean(opts.json),
    args: { id, ...(opts.history ? { history: true } : {}) },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const shown = await client.query(api.show.get, parsed.args);
  console.log(parsed.json ? JSON.stringify(shown, null, 2) : brief(shown));
  return 0;
}
