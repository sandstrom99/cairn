// cn list — what is in the list, and where it stands.
//
//   cn list [--project <slug>] [--epic <ep-id>] [--status open|in_progress|closed|dropped]
//           [--mine] [--json]
//
// One line per issue, ordered by priority then age, each starting with the reference form.
// --mine is the issues claimed by this machine's actor (CAIRN_ACTOR, else <host>/<user>).
// Nothing is hidden: a deferred issue is still listed, because a list that goes quiet is
// how work disappears. What is *ready* to pick up is `cn ready`, which lands with the
// graph; this is the flat list.

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine } from "../lib/format.mts";

export const name = "list";
export const summary = "the issues, by priority then age";

const STATUSES = ["open", "in_progress", "closed", "dropped"] as const;

export type ListArgs = {
  project?: string;
  epic?: string;
  status?: (typeof STATUSES)[number];
  claimedBy?: string;
};

export type Parsed = { action: "help" } | { action: "list"; json: boolean; args: ListArgs };

const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const maybe = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

/** `me` is the actor --mine means; run passes this machine's. */
export function parse(argv: string[], me: string): Parsed {
  const { opts } = parseArgs(argv, {
    bool: ["help", "json", "mine"],
    value: ["project", "epic", "status"],
  });
  if (opts.help) return { action: "help" };
  const status = text(opts.status);
  if (status !== undefined && !STATUSES.includes(status as (typeof STATUSES)[number]))
    throw new UsageError(`--status is one of ${STATUSES.join(", ")}, not "${status}"`);
  return {
    action: "list",
    json: Boolean(opts.json),
    args: {
      ...maybe("project", text(opts.project)),
      ...maybe("epic", text(opts.epic)),
      ...maybe("status", status as (typeof STATUSES)[number] | undefined),
      ...maybe("claimedBy", opts.mine ? me : undefined),
    },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv, actor().name);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const issues = await client.query(api.issues.list, parsed.args);
  if (parsed.json) console.log(JSON.stringify(issues, null, 2));
  else if (issues.length > 0) console.log(issues.map(issueLine).join("\n"));
  return 0;
}
