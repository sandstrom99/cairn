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
//
// --description, --design and --acceptance are Markdown, which the web page sets and cn
// prints as written. Open each with a plain sentence, since cn prints the first line
// alone, and write --acceptance as a `- ` list, one criterion a line.
//
// A live issue in the epic whose title is near-identical to this one is printed under
// the line, `near` and its reference, and the issue is still created: whether it is a
// duplicate is yours to decide. An issue given --epic ep-0 with a --parent in an open
// epic goes beside its parent instead, and the answer says so on a `placed` line.
//
// Search first. `cn search <text>` reads every issue's title, description and journal
// across every status, and what you are about to file may already be there, done, dropped
// or half-done: then the answer is that issue, not a second one.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { FOLLOW_UP_KINDS, ISSUE_TYPES, maybe, oneOf, onlyFlags, priority } from "../lib/flags.mts";
import { UsageError, errorData, fail } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine, nearLine, placedLine } from "../lib/lines.mts";
import { ref } from "../lib/ref.mts";

export const name = "create";
export const summary = "put work in the list: one issue, in an epic";
export const spec = {
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
} as const satisfies ArgSpec;

type CreateArgs = {
  project: string;
  epic?: string;
  title: string;
  description?: string;
  design?: string;
  acceptance?: string;
  priority?: number;
  type?: (typeof ISSUE_TYPES)[number];
  followUpKind?: (typeof FOLLOW_UP_KINDS)[number];
  parent?: string;
  requires?: string[];
};

type Parsed = { action: "create"; args: CreateArgs };

const USAGE = "cn create --project <slug> --title <title> [--epic <ep-id>]";

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  onlyFlags(pos, USAGE);

  const { project, title } = opts;
  if (!project || !title) throw new UsageError(USAGE);

  return {
    action: "create",
    args: {
      project,
      title,
      ...maybe("epic", opts.epic),
      ...maybe("description", opts.description),
      ...maybe("design", opts.design),
      ...maybe("acceptance", opts.acceptance),
      ...maybe("priority", priority(opts.priority)),
      ...maybe("type", oneOf(opts.type, "type", ISSUE_TYPES)),
      ...maybe("followUpKind", oneOf(opts.kind, "kind", FOLLOW_UP_KINDS)),
      ...maybe("parent", opts.parent),
      ...maybe("requires", opts.requires),
    },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client, actor } = connect();
  try {
    const created = await client.mutation(api.issues.create, { actor, ...parsed.args });
    console.log(issueLine(created));
    for (const match of created.near) console.log(nearLine(match));
    if (created.placed && created.parent) console.log(placedLine(created.parent));
    return 0;
  } catch (e) {
    // The one error cn answers itself: the deployment hands back the open epics, and
    // reading them is the whole reason create refuses rather than guessing.
    const data = errorData(e);
    if (data?.kind !== "epic-required") throw e;
    const code = fail("an issue needs an epic; open epics:");
    for (const candidate of data.candidates) console.error(`  ${ref(candidate)}`);
    return code;
  }
}
