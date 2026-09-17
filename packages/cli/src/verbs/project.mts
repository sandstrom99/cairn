// cn project — the id prefixes work is minted under.
//
//   cn project new <slug> --name <name>     create a project
//   cn project list [--json]                one line per project
//
// A slug is the prefix of every issue id in it: `--project app` mints app-14. One to
// sixteen lowercase letters and digits, starting with a letter; `ep` and `bl` are
// reserved, because epics and blockers mint from the same counters. Nothing renames a
// project, because its ids carry the slug.

import { parseArgs } from "../lib/args.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";

export const name = "project";
export const summary = "the id prefixes work is minted under";

export type Parsed =
  | { action: "help" }
  | { action: "new"; args: { slug: string; name: string } }
  | { action: "list"; json: boolean };

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, { bool: ["help", "json"], value: ["name"] });
  if (opts.help) return { action: "help" };
  const [action, ...rest] = pos;
  if (action === "list") return { action: "list", json: Boolean(opts.json) };
  if (action !== "new") throw new UsageError(`cn project new|list, not "${action ?? ""}"`);
  const slug = rest[0];
  if (!slug || rest.length > 1) throw new UsageError("cn project new <slug> --name <name>");
  if (typeof opts.name !== "string") throw new UsageError("cn project new needs --name <name>");
  return { action: "new", args: { slug, name: opts.name } };
}

const line = (project: { slug: string; name: string }): string =>
  `${project.slug}  ${project.name}`;

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { client } = connect();
  if (parsed.action === "new") {
    console.log(
      line(await client.mutation(api.projects.create, { actor: actor(), ...parsed.args })),
    );
    return 0;
  }
  const projects = await client.query(api.projects.list, {});
  if (parsed.json) console.log(JSON.stringify(projects, null, 2));
  else if (projects.length > 0) console.log(projects.map(line).join("\n"));
  return 0;
}
