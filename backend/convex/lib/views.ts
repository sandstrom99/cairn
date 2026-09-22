// views.ts: the shapes the CLI receives. Nothing a public function returns ever contains
// `_id`: the public id is the id, and `_creationTime` comes back as `createdAt`. Every
// mention of an issue or epic travels as a Ref, id and title together, because the
// reference form `app-14 "fix connection retry"` is the only way either is ever printed.
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { notFound } from "./errors";
import { type IssueStatus, isLive } from "./validators";

export type Ref = { id: string; title: string };

/** Id and title, the two fields the reference form needs. */
export const ref = (doc: { id: string; title: string }): Ref => ({ id: doc.id, title: doc.title });

export async function issueView(ctx: QueryCtx, doc: Doc<"issues">) {
  const project = await ctx.db.get(doc.projectId);
  const epic = await ctx.db.get(doc.epicId);
  if (!project || !epic) throw notFound(doc.id);
  const parent = doc.parentIssueId ? await ctx.db.get(doc.parentIssueId) : null;
  return {
    id: doc.id,
    project: project.slug,
    epic: ref(epic),
    title: doc.title,
    description: doc.description,
    design: doc.design,
    acceptance: doc.acceptance,
    type: doc.type,
    followUpKind: doc.followUpKind,
    parent: parent ? ref(parent) : undefined,
    requires: doc.requires,
    status: doc.status,
    priority: doc.priority,
    claimedBy: doc.claimedBy,
    claimedAt: doc.claimedAt,
    lastActivity: doc.lastActivity,
    deferUntil: doc.deferUntil,
    verification: doc.verification,
    droppedReason: doc.droppedReason,
    closedAt: doc.closedAt,
    revision: doc.revision,
    createdAt: doc._creationTime,
  };
}

export type IssueView = Awaited<ReturnType<typeof issueView>>;

/**
 * An epic with its counts. The four status counts are over `task` issues only and
 * `followUps` is the open follow-up work beside them: a follow-up sits outside the
 * denominator, so an epic's progress cannot be diluted by its own residue (§5).
 */
export async function epicView(ctx: QueryCtx, doc: Doc<"epics">) {
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_epic", (q) => q.eq("epicId", doc._id))
    .collect();
  const tasks = issues.filter((i) => i.type === "task");
  const count = (status: IssueStatus) => tasks.filter((i) => i.status === status).length;
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    lastReconciledAt: doc.lastReconciledAt,
    revision: doc.revision,
    createdAt: doc._creationTime,
    counts: {
      open: count("open"),
      inProgress: count("in_progress"),
      closed: count("closed"),
      dropped: count("dropped"),
      followUps: issues.filter((i) => i.type === "follow-up" && isLive(i)).length,
    },
  };
}

export type EpicView = Awaited<ReturnType<typeof epicView>>;

/**
 * A blocker with the issues it holds. The blocker's own `kind` travels as `blockerKind`,
 * because `show.get` spreads this view under its own `kind: "blocker"` discriminator and
 * two fields called `kind` would be one field; every JSON spells it the same way.
 */
export async function blockerView(ctx: QueryCtx, doc: Doc<"blockers">) {
  const links = await ctx.db
    .query("blockerLinks")
    .withIndex("by_blocker", (q) => q.eq("blockerId", doc._id))
    .collect();
  const issues = await Promise.all(links.map((l) => ctx.db.get(l.issueId)));
  return {
    id: doc.id,
    title: doc.title,
    blockerKind: doc.kind,
    owner: doc.owner,
    whatResolves: doc.whatResolves,
    nudgeAt: doc.nudgeAt,
    status: doc.status,
    raisedBy: doc.raisedBy,
    raisedAt: doc._creationTime,
    resolvedBy: doc.resolvedBy,
    resolvedAt: doc.resolvedAt,
    resolution: doc.resolution,
    revision: doc.revision,
    issues: issues.filter((i): i is Doc<"issues"> => i !== null).map(ref),
  };
}

export type BlockerView = Awaited<ReturnType<typeof blockerView>>;
