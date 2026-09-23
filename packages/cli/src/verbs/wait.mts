// cn wait — raise a human blocker on an issue, or attach one that already exists.
//
//   cn wait <id> --kind approval|external-wait|decision|credential|purchase
//                --owner <who must act> --title <what is waited on>
//                --resolves <what would end it> [--nudge <YYYY-MM-DD>]
//   cn wait <id> --on bl-3
//
// Agents raise blockers and people resolve them: `cn ack` and `cn resolve` refuse an
// agent, so what is raised here is genuinely handed over. One blocker can hold many
// issues — `--on bl-3` attaches the one that already exists rather than minting a second
// row for the same wait, and resolving it frees all of them at once.
//
// The issue leaves `cn ready` the moment a blocker is raised on it and comes back the
// moment that blocker resolves, with nothing recomputed in between. It stays in
// `cn list` throughout: waiting work is not gone, it is just not claimable.
//
// --owner is who must act, and is required. --resolves is what would end the wait,
// written so the person can act on it without asking. --nudge is the day to look again.

import { parseArgs } from "../lib/args.mts";
import { BLOCKER_KINDS, date, maybe, need, oneOf, onlyId } from "../lib/flags.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { blockerLine, holdsLine } from "../lib/lines.mts";

export const name = "wait";
export const summary = "raise a human blocker on an issue, or attach one that exists";

/** The options that describe a new blocker; none of them goes with `--on`. */
const DESCRIBING = ["kind", "owner", "title", "resolves", "nudge"] as const;

export type WaitArgs = {
  issue: string;
  on?: string;
  kind?: (typeof BLOCKER_KINDS)[number];
  owner?: string;
  title?: string;
  whatResolves?: string;
  nudgeAt?: number;
};

export type Parsed = { action: "help" } | { action: "wait"; args: WaitArgs };

const USAGE =
  "cn wait <id> --kind approval --owner <who> --title <what> --resolves <what ends it>, or cn wait <id> --on bl-3";

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, {
    bool: ["help"],
    value: ["on", ...DESCRIBING],
  });
  if (opts.help) return { action: "help" };

  const issue = onlyId(pos, USAGE);

  if (opts.on !== undefined) {
    const also = DESCRIBING.filter((o) => opts[o] !== undefined);
    if (also.length > 0)
      throw new UsageError(
        `--on attaches an existing blocker; ${also.map((o) => `--${o}`).join(" and ")} describes a new one`,
      );
    return { action: "wait", args: { issue, on: opts.on } };
  }

  const kind = need(
    oneOf(opts.kind, "kind", BLOCKER_KINDS),
    `a new blocker needs --kind ${BLOCKER_KINDS.join("|")}`,
  );
  const { owner, title, resolves: whatResolves } = opts;
  for (const [flag, value] of [
    ["owner", owner],
    ["title", title],
    ["resolves", whatResolves],
  ] as const)
    if (value === undefined || value.trim() === "")
      throw new UsageError(`a new blocker needs --${flag}`);

  return {
    action: "wait",
    args: {
      issue,
      kind,
      owner,
      title,
      whatResolves,
      ...maybe("nudgeAt", date(opts.nudge, "nudge")),
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
  const { blocker } = await client.mutation(api.blockers.raise, {
    actor: actor(),
    ...parsed.args,
  });
  console.log(blockerLine(blocker));
  console.log(holdsLine(blocker.issues));
  return 0;
}
