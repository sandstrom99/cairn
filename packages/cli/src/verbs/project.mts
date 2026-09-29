// cn project — the id prefixes work is minted under.
//
//   cn project new <slug> --name <name>     create a project
//   cn project list [--json]                a health block per project
//
// `list` prints a block per project as `cn epic list` does per epic (docs/design.md §8):
// the counts, then what is moving, what is stuck past its priority's limit, and what
// waits on a person, since epics cut across projects and cannot say whether anything in
// one has stopped. A project nothing is filed under reads `nothing filed`. `--json` also
// carries each project's pulse: the events on its issues and the closes among them for
// each of the last 28 days, oldest first.
//
// A slug is the prefix of every issue id in it: `--project app` mints app-14. One to
// sixteen lowercase letters and digits, starting with a letter; `ep` and `bl` are
// reserved, because epics and blockers mint from the same counters. Nothing renames a
// project, because its ids carry the slug.

import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { onlyFlags } from "../lib/flags.mts";
import { UsageError, answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { projectLine, projectLines } from "../lib/lines.mts";

export const name = "project";
export const summary = "the id prefixes work is minted under";
export const spec = { bool: ["json"], value: ["name"] } as const satisfies ArgSpec;

type Parsed =
  | { action: "new"; args: { slug: string; name: string } }
  | { action: "list"; json: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  const [action, ...rest] = pos;
  if (action === "list") {
    onlyFlags(rest, "cn project list [--json]");
    return { action: "list", json: opts.json };
  }
  if (action !== "new") throw new UsageError(`cn project new|list, not "${action ?? ""}"`);
  const slug = rest[0];
  if (!slug || rest.length > 1) throw new UsageError("cn project new <slug> --name <name>");
  if (opts.name === undefined) throw new UsageError("cn project new needs --name <name>");
  return { action: "new", args: { slug, name: opts.name } };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client, actor } = connect();
  if (parsed.action === "new") {
    console.log(projectLine(await client.mutation(api.projects.create, { actor, ...parsed.args })));
    return 0;
  }
  const projects = await client.query(api.projects.list, {});
  // A health block per project, a blank line between them.
  answer(parsed.json, projects, (all) =>
    all.flatMap((p, i) => (i === 0 ? [] : [""]).concat(projectLines(p))),
  );
  return 0;
}
