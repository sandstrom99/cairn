// followUp.ts: the routed residue of §5, minted in one place. `issues.close` creates it
// beside the parent, with `--follow-up` or, for an unverified close with none, on its own,
// so the insert and its `issue.create` event live here rather than in two copies that
// would drift apart at the first field added.
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./actor";
import { notFound } from "./errors";
import { insertIssue } from "./lifecycle";
import type { FollowUpKind } from "./validators";
import type { IssueView } from "./views";

type FollowUpInput = {
  title: string;
  kind: FollowUpKind;
  priority?: number;
  description?: string;
};

/**
 * A follow-up on `parent`: same project, same epic, parent linked, priority the parent's
 * unless one is given. Returns the view of the row it inserted.
 */
export async function createFollowUp(
  ctx: MutationCtx,
  actor: Actor,
  parent: Doc<"issues">,
  args: FollowUpInput,
): Promise<IssueView> {
  const project = await ctx.db.get(parent.projectId);
  if (!project) throw notFound(parent.id);
  return await insertIssue(ctx, actor, {
    project,
    epicId: parent.epicId,
    title: args.title,
    description: args.description,
    type: "follow-up",
    followUpKind: args.kind,
    parentIssueId: parent._id,
    links: [],
    priority: args.priority ?? parent.priority,
  });
}
