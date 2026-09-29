// views.ts: the shapes the CLI receives. Nothing a public function returns ever contains
// `_id`: the public id is the id, and `_creationTime` comes back as `createdAt`. Every
// mention of an issue or epic travels as a Ref, id and title together, because the
// reference form `app-14 "fix connection retry"` is the only way either is ever printed.
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { notFound } from "./errors";
import { issuesHeldBy } from "./graph";
import { type IssueStatus, isLive } from "./validators";

export type Ref = { id: string; title: string };

/** Id and title, the two fields the reference form needs. */
export const ref = (doc: { id: string; title: string }): Ref => ({ id: doc.id, title: doc.title });

/**
 * An issue with its status, the way every issue cairn names is read: a finished one reads as
 * finished, not as live.
 */
export type End = Ref & { status: IssueStatus };

export const end = (doc: Doc<"issues">): End => ({ ...ref(doc), status: doc.status });

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
    parent: parent ? end(parent) : undefined,
    links: doc.links,
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
 * The counts of a set of issues, an epic's or a project's. The four status counts are over
 * `task` issues only and `followUps` is the open follow-up work beside them: a follow-up
 * sits outside the denominator, so progress cannot be diluted by its own residue (§5).
 */
export function countsOf(issues: Doc<"issues">[]) {
  const tasks = issues.filter((i) => i.type === "task");
  const count = (status: IssueStatus) => tasks.filter((i) => i.status === status).length;
  return {
    open: count("open"),
    inProgress: count("in_progress"),
    closed: count("closed"),
    dropped: count("dropped"),
    followUps: issues.filter((i) => i.type === "follow-up" && isLive(i)).length,
  };
}

/**
 * An epic with its counts, as `countsOf` reads them. It takes the epic's issues rather
 * than reading them, so one read serves the view, the health line and whatever else the
 * caller does with them.
 */
export function epicView(doc: Doc<"epics">, issues: Doc<"issues">[]) {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    links: doc.links,
    status: doc.status,
    droppedReason: doc.droppedReason,
    revision: doc.revision,
    createdAt: doc._creationTime,
    counts: countsOf(issues),
  };
}

/** A project as every answer carries it: its slug, name, description, links and revision. */
export function projectView(doc: Doc<"projects">) {
  return {
    slug: doc.slug,
    name: doc.name,
    description: doc.description,
    links: doc.links,
    revision: doc.revision ?? 0,
  };
}

/**
 * A blocker with the issues it holds. The blocker's own `kind` travels as `blockerKind`,
 * because `show.get` spreads this view under its own `kind: "blocker"` discriminator and
 * two fields called `kind` would be one field; every JSON spells it the same way.
 */
export async function blockerView(ctx: QueryCtx, doc: Doc<"blockers">) {
  return {
    id: doc.id,
    title: doc.title,
    blockerKind: doc.kind,
    owner: doc.owner,
    whatResolves: doc.whatResolves,
    links: doc.links,
    nudgeAt: doc.nudgeAt,
    status: doc.status,
    raisedBy: doc.raisedBy,
    raisedAt: doc._creationTime,
    resolvedBy: doc.resolvedBy,
    resolvedAt: doc.resolvedAt,
    resolution: doc.resolution,
    said: doc.said,
    revision: doc.revision,
    issues: (await issuesHeldBy(ctx, doc._id)).map(end),
  };
}
