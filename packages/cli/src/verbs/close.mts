// cn close — finish an issue, with something that proves it.
//
//   cn close <id> --revision N --run '<command>'
//   cn close <id> --revision N --unverified '<why>'
//                 [--follow-up <title> --kind verify|decide|cleanup
//                  [--requires <cap>…] [--priority 0-4]]
//
// --run runs the command here and records it: the command, its exit status and the last
// 40 lines it wrote, with a ten-minute timeout. The agent never types the output in, so
// there is nothing to fabricate, and a command that exits non-zero cannot close the
// issue — the choice is to fix it, or to close --unverified and say why.
//
// --unverified is for proof cn cannot run: a device, another machine, a person's eyes.
// Record that proof as a journal entry first (`cn journal <id> --kind evidence …`) and
// point the reason at it.
//
// --follow-up creates the residue in the same mutation, linked to this issue and in the
// same epic, so a parent never closes without it: the iOS check that this machine cannot
// run, the decision that surfaced on the way. It is counted outside the epic's
// denominator, so "12 done" keeps meaning what it says. --requires is what a session
// needs to finish it: ios, android, web, device, decision.
//
// An --unverified close with no --follow-up gets one anyway: a `verify:` follow-up is
// spawned beside it in the same mutation, by you, unless the issue already has a child. And
// when the close finishes the last issue of its epic, follow-ups included, the answer
// says the epic can close and prints the `cn epic close` line. It is an offer; the close
// of the epic is yours to run.

import { parseArgs } from "../lib/args.mts";
import { FOLLOW_UP_KINDS, maybe, oneOf, onlyId, priority, revision } from "../lib/flags.mts";
import { actor } from "../lib/actor.mts";
import { UsageError, usageFromHeader, say, warn } from "../lib/cli.mts";
import { api, connect } from "../lib/client.mts";
import { closedLines } from "../lib/lines.mts";
import { runCommand } from "../lib/run.mts";

export const name = "close";
export const summary = "finish an issue, with a command that proves it";

/** How much of a failed run belongs on the screen beside the refusal. */
const ON_REFUSAL = 10;

export type FollowUp = {
  title: string;
  kind: (typeof FOLLOW_UP_KINDS)[number];
  requires?: string[];
  priority?: number;
};

/** What proves it: a command to run here, or a reason it could not be run here. */
export type Proof = { run: string } | { unverified: string };

export type Parsed =
  | { action: "help" }
  | {
      action: "close";
      id: string;
      revision: number;
      proof: Proof;
      followUp?: FollowUp;
    };

const USAGE = "cn close <id> --revision N --run '<command>' | --unverified <why>";

export function parse(argv: string[]): Parsed {
  const { pos, opts } = parseArgs(argv, {
    bool: ["help"],
    value: ["revision", "run", "unverified", "follow-up", "kind", "priority"],
    list: ["requires"],
  });
  if (opts.help) return { action: "help" };

  const id = onlyId(pos, USAGE);
  const rev = revision(opts.revision, "cn close <id> --revision N");

  const command = opts.run;
  const unverified = opts.unverified;
  if ((command === undefined) === (unverified === undefined))
    throw new UsageError(
      "cn close takes exactly one of --run '<command>' and --unverified '<why>'",
    );
  const proof: Proof = command === undefined ? { unverified: unverified! } : { run: command };

  const title = opts["follow-up"];
  const kind = oneOf(opts.kind, "kind", FOLLOW_UP_KINDS);
  if (title === undefined && kind !== undefined)
    throw new UsageError("--kind belongs to --follow-up <title>");
  if (title !== undefined && kind === undefined)
    throw new UsageError(`--follow-up needs --kind ${FOLLOW_UP_KINDS.join("|")}`);

  const followUp: FollowUp | undefined =
    title === undefined
      ? undefined
      : {
          title,
          kind: kind!,
          ...maybe("requires", opts.requires),
          ...maybe("priority", priority(opts.priority)),
        };

  return { action: "close", id, revision: rev, proof, ...maybe("followUp", followUp) };
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  if (parsed.action === "help") {
    console.log(usageFromHeader(import.meta.url));
    return 0;
  }
  const { id, proof, followUp } = parsed;

  // The command runs before the call, so what goes to the deployment is what happened.
  if ("run" in proof) say(`running ${proof.run}`);
  const verification = "run" in proof ? runCommand(proof.run) : proof;

  const { client } = connect();
  try {
    const closed = await client.mutation(api.issues.close, {
      actor: actor(),
      id,
      revision: parsed.revision,
      verification,
      ...maybe("followUp", followUp),
    });
    console.log(closedLines(closed).join("\n"));
    return 0;
  } catch (e) {
    // The deployment refuses a failed command, and the refusal names the exit code but
    // not what the command said. The tail is here, so print it rather than make the
    // reader run it again.
    if ("command" in verification && verification.output) {
      warn(`${verification.command} exited ${verification.exitCode}, last lines:`);
      for (const line of verification.output.split("\n").slice(-ON_REFUSAL)) warn(line);
    }
    throw e;
  }
}
