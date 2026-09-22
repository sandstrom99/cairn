// raise.ts: minting a human blocker and attaching one that exists, the two writes
// `blockers.raise` is made of. Reconcile raises its judgement questions through the same
// mechanism as everything else waiting on a person (§7), so the insert, the link and the
// events live here and `blockers.raise` keeps only the validation around them.
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./actor";
import { record } from "./events";
import { linkBetween } from "./graph";
import { mint } from "./ids";

export type BlockerFields = {
  kind: Doc<"blockers">["kind"];
  owner: string;
  title: string;
  whatResolves: string;
  nudgeAt?: number;
};

/**
 * A new `bl-N` on `issue`, linked and recorded. The event names the blocker in its
 * `changes` and carries no revision: the issue's own revision did not move (§9).
 */
export async function raiseBlocker(
  ctx: MutationCtx,
  actor: Actor,
  issue: Doc<"issues">,
  fields: BlockerFields,
): Promise<Doc<"blockers">> {
  const n = await mint(ctx, "bl");
  const _id = await ctx.db.insert("blockers", {
    id: `bl-${n}`,
    kind: fields.kind,
    owner: fields.owner,
    title: fields.title,
    whatResolves: fields.whatResolves,
    ...(fields.nudgeAt === undefined ? {} : { nudgeAt: fields.nudgeAt }),
    status: "raised",
    raisedBy: actor,
    revision: 0,
  });
  await ctx.db.insert("blockerLinks", { blockerId: _id, issueId: issue._id });
  await record(ctx, {
    kind: "blocker.raise",
    actor,
    issueId: issue._id,
    blockerId: _id,
    changes: {
      id: `bl-${n}`,
      blockerKind: fields.kind,
      owner: fields.owner,
      title: fields.title,
      whatResolves: fields.whatResolves,
      ...(fields.nudgeAt === undefined ? {} : { nudgeAt: fields.nudgeAt }),
      issue: issue.id,
    },
  });
  return (await ctx.db.get(_id))!;
}

/** One more issue held by a blocker that exists. Idempotent: the same pair is one link. */
export async function attachBlocker(
  ctx: MutationCtx,
  actor: Actor,
  blocker: Doc<"blockers">,
  issue: Doc<"issues">,
): Promise<void> {
  if (await linkBetween(ctx, blocker._id, issue._id)) return;
  await ctx.db.insert("blockerLinks", { blockerId: blocker._id, issueId: issue._id });
  await record(ctx, {
    kind: "blocker.attach",
    actor,
    issueId: issue._id,
    blockerId: blocker._id,
    changes: { blocker: blocker.id, issue: issue.id },
  });
}
