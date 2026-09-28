// cn update — change an issue, an epic or a blocker, against the revision you read.
//
//   cn update <id> --revision N [--title <text>] [--description <text>] [--design <how>]
//                  [--acceptance <what>] [--priority 0-4] [--epic <ep-id>]
//                  [--defer-until <date>|none] [--requires <cap>… | --requires none]
//                  [--link <url>…] [--unlink <url>…]
//   cn update ep-N --revision N [--title <text>] [--description <text>]
//                  [--link <url>…] [--unlink <url>…]
//   cn update bl-N --revision N [--title <text>] [--resolves <what ends it>]
//                  [--link <url>…] [--unlink <url>…]
//
// --revision is the number the thing was at when you read it: every line cn prints for
// an issue ends with it, and `cn show` prints it for an epic or a blocker. A write against
// a revision that has moved is refused with every change since — who changed what, and
// when — so the answer is to re-read, decide and retry, never to force it.
//
// The id says what is changed. An epic takes its title, description and links; a blocker
// its title, what ends it (--resolves, as `cn wait` spells it) and links, while its kind
// and owner stay as raised. A flag the thing has no field for is refused, naming it.
//
// --defer-until parks the issue until a date, which hides it from `cn ready` and from
// nothing else; `none` clears the date. `--requires none` clears the capabilities.
// --design is HOW and may change; --acceptance is WHAT and should not. All three text
// fields are Markdown, and take `@-` for stdin or `@path` for a file, as `cn create --help`
// says.
//
// --link adds a link, a bare URL or '[label](url)', http or https only. A URL the thing
// already carries takes the new label, and given bare it is left as it is, so linking
// twice is harmless. --unlink <url> takes one off and refuses a URL the thing does not
// carry. Both repeat.

import type { LinkInput } from "@cairn/backend/convex/lib/links.js";
import { type ArgSpec, parseArgs } from "../lib/args.mts";
import { date, links, maybe, onlyId, priority, revision, text, urls } from "../lib/flags.mts";
import { UsageError } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { blockerLine, issueLine } from "../lib/lines.mts";
import { ref } from "../lib/ref.mts";

export const name = "update";
export const summary = "change an issue, an epic or a blocker, against the revision you read";
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
    "resolves",
  ],
  list: ["requires", "link", "unlink"],
} as const satisfies ArgSpec;

type Kind = "issue" | "epic" | "blocker";

/**
 * The prefix `show.get` dispatches on: `ep-` an epic, `bl-` a blocker, anything else an
 * issue. No project can mint an issue under either, since `ep` and `bl` are reserved slugs.
 */
const kindOf = (id: string): Kind =>
  id.startsWith("ep-") ? "epic" : id.startsWith("bl-") ? "blocker" : "issue";

type Flag = Exclude<(typeof spec.value)[number] | (typeof spec.list)[number], "revision">;

/** The flags each kind has a field for, in the header's order. */
const FITS: Record<Kind, readonly Flag[]> = {
  issue: [
    "title",
    "description",
    "design",
    "acceptance",
    "priority",
    "epic",
    "defer-until",
    "requires",
    "link",
    "unlink",
  ],
  epic: ["title", "description", "link", "unlink"],
  blocker: ["title", "resolves", "link", "unlink"],
};

const ARTICLE: Record<Kind, string> = { issue: "an issue", epic: "an epic", blocker: "a blocker" };

/** `--a, --b and --c`. */
const flagList = (flags: readonly Flag[]): string => {
  const named = flags.map((flag) => `--${flag}`);
  return `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
};

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

type EpicUpdateArgs = {
  id: string;
  revision: number;
  title?: string;
  description?: string;
  link?: LinkInput[];
  unlink?: string[];
};

type BlockerUpdateArgs = {
  id: string;
  revision: number;
  title?: string;
  whatResolves?: string;
  link?: LinkInput[];
  unlink?: string[];
};

type Parsed =
  | { action: "update"; kind: "issue"; args: UpdateArgs }
  | { action: "update"; kind: "epic"; args: EpicUpdateArgs }
  | { action: "update"; kind: "blocker"; args: BlockerUpdateArgs };

/** Refused when nothing but the id and the revision was given. */
const NOTHING = "cn update <id> --revision N needs a field to change";

/** `--defer-until`: a date, or `none` to clear it. */
const deferUntil = (given: string | undefined): number | null | undefined =>
  given === "none" ? null : date(given, "defer-until");

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, spec);

  const id = onlyId(pos, "cn update <id> --revision N [--title …]");
  const rev = revision(opts.revision, "cn update <id> --revision N");

  const kind = kindOf(id);
  const given = [...spec.value, ...spec.list].filter(
    (flag): flag is Flag => flag !== "revision" && opts[flag] !== undefined,
  );
  const stray = given.find((flag) => !FITS[kind].includes(flag));
  if (stray !== undefined)
    throw new UsageError(
      `${ARTICLE[kind]} has no --${stray}; cn update ${id} takes ${flagList(FITS[kind])}`,
    );

  // Every kind edits its links the same way, and its title as the plain string it was given.
  const common = {
    id,
    revision: rev,
    ...maybe("title", opts.title),
  };
  const linking = {
    ...maybe("link", links(opts.link)),
    ...maybe("unlink", urls(opts.unlink, "--unlink")),
  };

  if (kind === "epic") {
    const args: EpicUpdateArgs = {
      ...common,
      ...maybe("description", text(opts.description, "--description")),
      ...linking,
    };
    if (Object.keys(args).length === 2) throw new UsageError(NOTHING);
    return { action: "update", kind, args };
  }
  if (kind === "blocker") {
    const args: BlockerUpdateArgs = {
      ...common,
      ...maybe("whatResolves", opts.resolves),
      ...linking,
    };
    if (Object.keys(args).length === 2) throw new UsageError(NOTHING);
    return { action: "update", kind, args };
  }

  // `--requires none` is how a list gets emptied: an absent flag leaves it alone.
  const listed = opts.requires;
  const requires = listed?.length === 1 && listed[0] === "none" ? [] : listed;

  const args: UpdateArgs = {
    ...common,
    ...maybe("description", text(opts.description, "--description")),
    ...maybe("design", text(opts.design, "--design")),
    ...maybe("acceptance", text(opts.acceptance, "--acceptance")),
    ...maybe("priority", priority(opts.priority)),
    ...maybe("epic", opts.epic),
    ...maybe("deferUntil", deferUntil(opts["defer-until"])),
    ...maybe("requires", requires),
    ...linking,
  };
  if (Object.keys(args).length === 2) throw new UsageError(NOTHING);
  return { action: "update", kind, args };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const { client, actor } = connect();
  if (parsed.kind === "epic") {
    const epic = await client.mutation(api.epics.update, { actor, ...parsed.args });
    console.log(`${ref(epic)} r${epic.revision}`);
    return 0;
  }
  if (parsed.kind === "blocker") {
    const blocker = await client.mutation(api.blockers.update, { actor, ...parsed.args });
    console.log(`${blockerLine(blocker)} r${blocker.revision}`);
    return 0;
  }
  const issue = await client.mutation(api.issues.update, { actor, ...parsed.args });
  console.log(issueLine(issue));
  return 0;
}
