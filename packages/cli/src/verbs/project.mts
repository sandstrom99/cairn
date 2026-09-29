// cn project — the id prefixes work is minted under.
//
//   cn project new <slug> --name <name>          create a project
//                  [--description <text>] [--link <url>…]
//   cn project update <slug> --revision N        change its name, description or links
//                     [--name <name>] [--description <text>] [--link <url>…] [--unlink <url>…]
//   cn project list [--json]                     a health block per project
//
// `list` prints a block per project as `cn epic list` does per epic (docs/design.md §8):
// the counts, then what is moving, what is stuck past its priority's limit, and what
// waits on a person, since epics cut across projects and cannot say whether anything in
// one has stopped. A project nothing is filed under reads `nothing filed`. `--json` also
// carries each project's description, links and revision, and its pulse: the events on
// its issues and the closes among them for each of the last 28 days, oldest first.
//
// A slug is the prefix of every issue id in it: `--project app` mints app-14. One to
// sixteen lowercase letters and digits, starting with a letter; `ep` and `bl` are
// reserved, because epics and blockers mint from the same counters.
//
// The name is the project's one-line summary. The description is optional context, such
// as what does not belong in it or which repository its work lands in, and is Markdown
// taking `@-` or `@path` like `cn create`'s; a repository is a link, a URL cairn never
// reads, given as `cn create --help` says. `update` changes those against a revision, as
// `cn update` does for an epic, and refuses a stale one with every change since; the
// revision is in `cn project list --json`. Nothing changes a slug, because every issue id
// in the project carries it. `cn update` stays for ids, and a slug is not one.

import type { LinkInput } from "@cairn/backend/convex/lib/links.js";
import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { links, maybe, onlyFlags, onlyId, revision, text, urls } from "../lib/flags.mts";
import { UsageError, answer } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { projectLine, projectLines } from "../lib/lines.mts";
import { ref } from "../lib/ref.mts";

export const name = "project";
export const summary = "the id prefixes work is minted under";
export const spec = {
  bool: ["json"],
  value: ["name", "description", "revision"],
  list: ["link", "unlink"],
} as const satisfies ArgSpec;

type NewArgs = { slug: string; name: string; description?: string; link?: LinkInput[] };

type UpdateArgs = {
  slug: string;
  revision: number;
  name?: string;
  description?: string;
  link?: LinkInput[];
  unlink?: string[];
};

type Parsed =
  | { action: "new"; args: NewArgs }
  | { action: "update"; args: UpdateArgs }
  | { action: "list"; json: boolean };

const NEW = "cn project new <slug> --name <name> [--description <text>] [--link <url>…]";

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);
  const [action, ...rest] = pos;
  if (action === "list") {
    onlyFlags(rest, "cn project list [--json]");
    return { action: "list", json: opts.json };
  }
  if (action === "update") {
    const args: UpdateArgs = {
      slug: onlyId(rest, "cn project update <slug> --revision N [--name …]"),
      revision: revision(opts.revision, "cn project update <slug> --revision N"),
      ...maybe("name", opts.name),
      ...maybe("description", text(opts.description, "--description")),
      ...maybe("link", links(opts.link)),
      ...maybe("unlink", urls(opts.unlink, "--unlink")),
    };
    if (Object.keys(args).length === 2)
      throw new UsageError(
        "cn project update <slug> --revision N needs --name, --description, --link or --unlink",
      );
    return { action: "update", args };
  }
  if (action !== "new") throw new UsageError(`cn project new|update|list, not "${action ?? ""}"`);
  const slug = rest[0];
  if (!slug || rest.length > 1) throw new UsageError(NEW);
  if (opts.name === undefined) throw new UsageError("cn project new needs --name <name>");
  // A new project is at revision 0 and has no links to take off, so both are typos here.
  if (opts.revision !== undefined || opts.unlink !== undefined)
    throw new UsageError(`${NEW}: --revision and --unlink are cn project update's`);
  return {
    action: "new",
    args: {
      slug,
      name: opts.name,
      ...maybe("description", text(opts.description, "--description")),
      ...maybe("link", links(opts.link)),
    },
  };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client, actor } = connect();
  if (parsed.action === "new") {
    console.log(projectLine(await client.mutation(api.projects.create, { actor, ...parsed.args })));
    return 0;
  }
  if (parsed.action === "update") {
    const project = await client.mutation(api.projects.update, { actor, ...parsed.args });
    console.log(`${ref({ id: project.slug, title: project.name })} r${project.revision}`);
    return 0;
  }
  const projects = await client.query(api.projects.list, {});
  // A health block per project, a blank line between them.
  answer(parsed.json, projects, (all) =>
    all.flatMap((p, i) => (i === 0 ? [] : [""]).concat(projectLines(p))),
  );
  return 0;
}
