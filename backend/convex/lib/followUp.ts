// followUp.ts: the routed residue of §5, minted in one place. `issues.close --follow-up`
// creates it beside the parent it closes, and reconcile's R4 creates the one a close
// marked `unverified` never got, so the insert and its `issue.create` event live here
// rather than in two copies that would drift apart at the first field added.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./actor";
import { invalid, notFound } from "./errors";
import { record } from "./events";
import { mint } from "./ids";
import { type IssueView, createdChanges, issueView } from "./views";

/** 0 is highest, 4 is backlog, and nothing between is a fraction. */
export function checkPriority(priority: number): number {
  if (!Number.isInteger(priority) || priority < 0 || priority > 4)
    throw invalid(`priority ${priority} is not an integer 0 to 4, 0 highest`);
  return priority;
}

export type FollowUpKind = NonNullable<Doc<"issues">["followUpKind"]>;

export type FollowUpInput = {
  title: string;
  kind: FollowUpKind;
  requires?: string[];
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
  const now = Date.now();
  const n = await mint(ctx, project.slug);
  const _id: Id<"issues"> = await ctx.db.insert("issues", {
    id: `${project.slug}-${n}`,
    projectId: project._id,
    epicId: parent.epicId,
    title: args.title,
    ...(args.description === undefined ? {} : { description: args.description }),
    type: "follow-up",
    followUpKind: args.kind,
    parentIssueId: parent._id,
    requires: args.requires ?? [],
    status: "open",
    priority: checkPriority(args.priority ?? parent.priority),
    lastActivity: now,
    revision: 0,
  });
  const view = await issueView(ctx, (await ctx.db.get(_id))!);
  await record(ctx, {
    kind: "issue.create",
    actor,
    issueId: _id,
    epicId: parent.epicId,
    revision: 0,
    changes: createdChanges(view),
  });
  return view;
}
