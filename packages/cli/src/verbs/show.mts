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

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyId } from "../lib/flags.mts";
import { answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { brief } from "../lib/lines.mts";

export const name = "show";
export const summary = "one id, and its neighbourhood";
export const spec = { bool: ["json", "history"] } as const satisfies ArgSpec;

type Parsed = { action: "show"; json: boolean; args: { id: string; history?: boolean } };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  const id = onlyId(pos, "cn show <id> [--history] [--json]");
  return {
    action: "show",
    json: opts.json,
    args: { id, ...(opts.history ? { history: true } : {}) },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client } = connect();
  const shown = await client.query(api.show.get, parsed.args);
  answer(parsed.json, shown, (s) => [brief(s)]);
  return 0;
}
