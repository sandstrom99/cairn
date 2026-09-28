// cn update — change an issue, against the revision you read.
//
//   cn update <id> --revision N [--title <text>] [--description <text>] [--design <how>]
//                  [--acceptance <what>] [--priority 0-4] [--epic <ep-id>]
//                  [--defer-until <date>|none] [--requires <cap>… | --requires none]
//                  [--link <url>…] [--unlink <url>…]
//
// --revision is the number the issue was at when you read it, and every line cn prints
// for an issue ends with it. A write against a revision that has moved is refused with
// every change since — who changed what, and when — so the answer is to re-read, decide
// and retry, never to force it.
//
// --defer-until parks the issue until a date, which hides it from `cn ready` and from
// nothing else; `none` clears the date. `--requires none` clears the capabilities.
// --design is HOW and may change; --acceptance is WHAT and should not. All three text
// fields are Markdown, and take `@-` for stdin or `@path` for a file, as `cn create --help`
// says.
//
// --link adds a link, a bare URL or '[label](url)', http or https only. A URL the issue
// already carries takes the new label, and given bare it is left as it is, so linking
// twice is harmless. --unlink <url> takes one off and refuses a URL the issue does not
// carry. Both repeat.

import type { LinkInput } from "@cairn/backend/convex/lib/links.js";
import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { date, links, maybe, onlyId, priority, revision, text, urls } from "../lib/flags.mts";
import { UsageError } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { issueLine } from "../lib/lines.mts";

export const name = "update";
export const summary = "change an issue, against the revision you read";
export const spec = {
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
  list: ["requires", "link", "unlink"],
} as const satisfies ArgSpec;

type UpdateArgs = {
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
  link?: LinkInput[];
  unlink?: string[];
};

type Parsed = { action: "update"; args: UpdateArgs };

/** `--defer-until`: a date, or `none` to clear it. */
const deferUntil = (given: string | undefined): number | null | undefined =>
  given === "none" ? null : date(given, "defer-until");

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);

  const id = onlyId(pos, "cn update <id> --revision N [--title …]");
  const rev = revision(opts.revision, "cn update <id> --revision N");

  // `--requires none` is how a list gets emptied: an absent flag leaves it alone.
  const listed = opts.requires;
  const requires = listed?.length === 1 && listed[0] === "none" ? [] : listed;

  const args: UpdateArgs = {
    id,
    revision: rev,
    ...maybe("title", opts.title),
    ...maybe("description", text(opts.description, "--description")),
    ...maybe("design", text(opts.design, "--design")),
    ...maybe("acceptance", text(opts.acceptance, "--acceptance")),
    ...maybe("priority", priority(opts.priority)),
    ...maybe("epic", opts.epic),
    ...maybe("deferUntil", deferUntil(opts["defer-until"])),
    ...maybe("requires", requires),
    ...maybe("link", links(opts.link)),
    ...maybe("unlink", urls(opts.unlink, "--unlink")),
  };
  if (Object.keys(args).length === 2)
    throw new UsageError("cn update <id> --revision N needs a field to change");
  return { action: "update", args };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client, actor } = connect();
  const issue = await client.mutation(api.issues.update, { actor, ...parsed.args });
  console.log(issueLine(issue));
  return 0;
}
