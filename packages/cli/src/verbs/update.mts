// cn update — change an issue, against the revision you read.
//
//   cn update <id> --revision N [--title <text>] [--description <text>] [--design <how>]
//                  [--acceptance <what>] [--priority 0-4] [--epic <ep-id>]
//                  [--defer-until <date>|none] [--requires <cap>… | --requires none]
//
// --revision is the number the issue was at when you read it, and every line cn prints
// for an issue ends with it. A write against a revision that has moved is refused with
// every change since — who changed what, and when — so the answer is to re-read, decide
// and retry, never to force it.
//
// --defer-until parks the issue until a date, which hides it from `cn ready` and from
// nothing else; `none` clears the date. `--requires none` clears the capabilities.
// --design is HOW and may change; --acceptance is WHAT and should not.

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine } from "../lib/lines.mts";

export const name = "update";
export const summary = "change an issue, against the revision you read";

export type UpdateArgs = {
  id: string;
  revision: number;
  title?: string;
  description?: string;
  design?: string;
  acceptance?: string;
  priority?: number;
  epic?: string;
  deferUntil?: number | null;
  requires?: string[];
};

export type Parsed = { action: "help" } | { action: "update"; args: UpdateArgs };

const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const maybe = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

/** A date as anything Date.parse takes, or `none` to clear it. */
function deferUntil(given: string | undefined): number | null | undefined {
  if (given === undefined) return undefined;
  if (given === "none") return null;
  const at = Date.parse(given);
  if (Number.isNaN(at)) throw new UsageError(`--defer-until is a date or none, not "${given}"`);
  return at;
}

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, {
    bool: ["help"],
    value: [
      "revision",
      "title",
      "description",
      "design",
      "acceptance",
      "priority",
      "epic",
      "defer-until",
    ],
    list: ["requires"],
  });
  if (opts.help) return { action: "help" };

  const [id, ...rest] = pos;
  if (!id || rest.length > 0) throw new UsageError("cn update <id> --revision N [--title …]");

  const given = text(opts.revision);
  const revision = Number(given);
  if (given === undefined || !Number.isInteger(revision))
    throw new UsageError("cn update <id> --revision N: the revision cn last printed for it");

  const priority = text(opts.priority);
  if (priority !== undefined && Number.isNaN(Number(priority)))
    throw new UsageError(`--priority is a number 0 to 4, not "${priority}"`);

  // `--requires none` is how a list gets emptied: an absent flag leaves it alone.
  const listed = Array.isArray(opts.requires) ? opts.requires : undefined;
  const requires = listed?.length === 1 && listed[0] === "none" ? [] : listed;

  const args: UpdateArgs = {
    id,
    revision,
    ...maybe("title", text(opts.title)),
    ...maybe("description", text(opts.description)),
    ...maybe("design", text(opts.design)),
    ...maybe("acceptance", text(opts.acceptance)),
    ...maybe("priority", priority === undefined ? undefined : Number(priority)),
    ...maybe("epic", text(opts.epic)),
    ...maybe("deferUntil", deferUntil(text(opts["defer-until"]))),
    ...maybe("requires", requires),
  };
  if (Object.keys(args).length === 2)
    throw new UsageError("cn update <id> --revision N needs a field to change");
  return { action: "update", args };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  const issue = await client.mutation(api.issues.update, { actor: actor(), ...parsed.args });
  console.log(issueLine(issue));
  return 0;
}
