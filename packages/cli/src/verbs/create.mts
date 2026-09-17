// cn create — put work in the list.
//
//   cn create --project <slug> --epic <ep-id> --title <title>
//             [--priority 0-4] [--description <text>] [--design <how>] [--acceptance <what>]
//             [--type task|follow-up] [--kind verify|decide|cleanup] [--parent <id>]
//             [--requires <cap>…]
//
// An epic is required and there is no orphan state: a create with no --epic exits 1 and
// prints the open epics, so choosing one is cheaper than dumping into the inbox. `ep-0`
// is the inbox when none of them fits.
//
// --design is HOW it will be built and may change during implementation. --acceptance is
// WHAT success is, verifiable yes or no, and stays still across sessions: if rewriting
// the solution a different way would change it, it is a design note in a criterion's
// clothes. --requires is what a session needs to do it at all: ios, android, web, device,
// decision. --priority is 0 highest to 4 backlog, and defaults to 2.

import { ConvexError } from "convex/values";
import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine } from "../lib/format.mts";
import { type Referable, ref } from "../lib/ref.mts";

export const name = "create";
export const summary = "put work in the list: one issue, in an epic";

const TYPES = ["task", "follow-up"] as const;
const KINDS = ["verify", "decide", "cleanup"] as const;

export type CreateArgs = {
  project: string;
  epic?: string;
  title: string;
  description?: string;
  design?: string;
  acceptance?: string;
  priority?: number;
  type?: (typeof TYPES)[number];
  followUpKind?: (typeof KINDS)[number];
  parent?: string;
  requires?: string[];
};

export type Parsed = { action: "help" } | { action: "create"; args: CreateArgs };

const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** `{ epic: "ep-1" }` or `{}`: an absent option is an absent key, never an undefined one. */
const maybe = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

export function parse(argv: string[]): Parsed {
  const { opts } = parseArgs(argv, {
    bool: ["help"],
    value: [
      "project",
      "epic",
      "title",
      "description",
      "design",
      "acceptance",
      "priority",
      "type",
      "kind",
      "parent",
    ],
    list: ["requires"],
  });
  if (opts.help) return { action: "help" };

  const project = text(opts.project);
  const title = text(opts.title);
  if (!project || !title)
    throw new UsageError("cn create --project <slug> --title <title> [--epic <ep-id>]");

  const type = text(opts.type);
  if (type !== undefined && !TYPES.includes(type as (typeof TYPES)[number]))
    throw new UsageError(`--type is ${TYPES.join(" or ")}, not "${type}"`);
  const kind = text(opts.kind);
  if (kind !== undefined && !KINDS.includes(kind as (typeof KINDS)[number]))
    throw new UsageError(`--kind is ${KINDS.join(", ")}, not "${kind}"`);

  const priority = text(opts.priority);
  if (priority !== undefined && Number.isNaN(Number(priority)))
    throw new UsageError(`--priority is a number 0 to 4, not "${priority}"`);

  const requires = Array.isArray(opts.requires) ? opts.requires : undefined;
  return {
    action: "create",
    args: {
      project,
      title,
      ...maybe("epic", text(opts.epic)),
      ...maybe("description", text(opts.description)),
      ...maybe("design", text(opts.design)),
      ...maybe("acceptance", text(opts.acceptance)),
      ...maybe("priority", priority === undefined ? undefined : Number(priority)),
      ...maybe("type", type as (typeof TYPES)[number] | undefined),
      ...maybe("followUpKind", kind as (typeof KINDS)[number] | undefined),
      ...maybe("parent", text(opts.parent)),
      ...maybe("requires", requires),
    },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  try {
    const issue = await client.mutation(api.issues.create, { actor: actor(), ...parsed.args });
    console.log(issueLine(issue));
    return 0;
  } catch (e) {
    // The one error cn answers itself: the deployment hands back the open epics, and
    // reading them is the whole reason create refuses rather than guessing.
    const data =
      e instanceof ConvexError ? (e.data as { kind?: string; candidates?: Referable[] }) : null;
    if (data?.kind !== "epic-required") throw e;
    console.error("✗ an issue needs an epic; open epics:");
    for (const candidate of data.candidates ?? []) console.error(`  ${ref(candidate)}`);
    return 1;
  }
}
