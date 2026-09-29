// graph.ts: the shared reads over the graph of docs/design.md §3, the rows that point at
// an issue, an epic or a blocker, each read in one place. Every query over `edges` and
// `blockerLinks`, every read of `events` by the thing they hang on, and the issues of an
// epic live here and nowhere else. Readiness, health, show and review all ask what
// holds an issue, and §4 says three things can; a second spelling of that question is
// where it starts to answer differently from the first.
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { EdgeType, IssueStatus } from "./validators";

/** The issues of an epic, in creation order. Every epic read starts here and hands them on. */
export async function issuesIn(ctx: QueryCtx, epicId: Id<"epics">): Promise<Doc<"issues">[]> {
  return await ctx.db
    .query("issues")
    .withIndex("by_epic", (q) => q.eq("epicId", epicId))
    .collect();
}

/**
 * The issues under one epic, or one project, or one status, or all of them: the one index
 * that narrows, then the rest in memory. A company's worth of issues is a few hundred
 * documents, two orders off Convex's 16,384 cap, so the filters after the index cost
 * nothing worth an index of their own. `issues.list` and `search.find` narrow the same way.
 */
export async function issuesWhere(
  ctx: QueryCtx,
  where: { project: Doc<"projects"> | null; epic: Doc<"epics"> | null; status?: IssueStatus },
): Promise<Doc<"issues">[]> {
  const { project, epic, status } = where;
  let rows: Doc<"issues">[];
  if (epic) {
    rows = await issuesIn(ctx, epic._id);
  } else if (project) {
    rows = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) =>
        status === undefined
          ? q.eq("projectId", project._id)
          : q.eq("projectId", project._id).eq("status", status),
      )
      .collect();
  } else if (status !== undefined) {
    rows = await ctx.db
      .query("issues")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
  } else {
    rows = await ctx.db.query("issues").collect();
  }

  if (project) rows = rows.filter((i) => i.projectId === project._id);
  if (status !== undefined) rows = rows.filter((i) => i.status === status);
  return rows;
}

/**
 * True when an issue has any child at all, whatever its status: a dropped follow-up was
 * a decision. `issues.close` asks before spawning one and `review.get` asks when listing
 * an unverified close, so the question is spelled once.
 */
export async function hasChild(ctx: QueryCtx, issueId: Id<"issues">): Promise<boolean> {
  const child = await ctx.db
    .query("issues")
    .withIndex("by_parent", (q) => q.eq("parentIssueId", issueId))
    .first();
  return child !== null;
}

/** The edges out of an issue, of one type when given. */
export async function edgesFrom(
  ctx: QueryCtx,
  issueId: Id<"issues">,
  type?: EdgeType,
): Promise<Doc<"edges">[]> {
  return await ctx.db
    .query("edges")
    .withIndex("by_from", (q) =>
      type === undefined ? q.eq("from", issueId) : q.eq("from", issueId).eq("type", type),
    )
    .collect();
}

/** The edges into an issue, of one type when given. `blocked-by` is `blocks` read this way. */
export async function edgesTo(
  ctx: QueryCtx,
  issueId: Id<"issues">,
  type?: EdgeType,
): Promise<Doc<"edges">[]> {
  return await ctx.db
    .query("edges")
    .withIndex("by_to", (q) =>
      type === undefined ? q.eq("to", issueId) : q.eq("to", issueId).eq("type", type),
    )
    .collect();
}

/** The link row for this blocker and issue, or null. */
export async function linkBetween(
  ctx: QueryCtx,
  blockerId: Id<"blockers">,
  issueId: Id<"issues">,
): Promise<Doc<"blockerLinks"> | null> {
  const rows = await ctx.db
    .query("blockerLinks")
    .withIndex("by_blocker", (q) => q.eq("blockerId", blockerId))
    .collect();
  return rows.find((l) => l.issueId === issueId) ?? null;
}

/** The unresolved blockers holding an issue, in the order they were attached. */
export async function unresolvedBlockersOn(
  ctx: QueryCtx,
  issueId: Id<"issues">,
): Promise<Doc<"blockers">[]> {
  const links = await ctx.db
    .query("blockerLinks")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .collect();
  const docs = await Promise.all(links.map((l) => ctx.db.get(l.blockerId)));
  return docs.filter((b): b is Doc<"blockers"> => b !== null && b.status !== "resolved");
}

/** Every issue a blocker holds, finished ones included, in the order they were attached. */
export async function issuesHeldBy(
  ctx: QueryCtx,
  blockerId: Id<"blockers">,
): Promise<Doc<"issues">[]> {
  const links = await ctx.db
    .query("blockerLinks")
    .withIndex("by_blocker", (q) => q.eq("blockerId", blockerId))
    .collect();
  const docs = await Promise.all(links.map((l) => ctx.db.get(l.issueId)));
  return docs.filter((i): i is Doc<"issues"> => i !== null);
}

/** The tables whose rows carry a revision and have events hung on them. */
export type Revisioned = "issues" | "epics" | "blockers" | "projects";

/** A document events hang on: which table it is in decides which index reads them. */
export type Target<T extends Revisioned = Revisioned> = T extends Revisioned
  ? { table: T; doc: Doc<T> }
  : never;

/** The events hung on a target, through its table's own index, in index order. */
function eventsQuery(ctx: QueryCtx, target: Target) {
  const events = ctx.db.query("events");
  if (target.table === "issues")
    return events.withIndex("by_issue", (q) => q.eq("issueId", target.doc._id));
  if (target.table === "epics")
    return events.withIndex("by_epic", (q) => q.eq("epicId", target.doc._id));
  if (target.table === "blockers")
    return events.withIndex("by_blocker", (q) => q.eq("blockerId", target.doc._id));
  return events.withIndex("by_project", (q) => q.eq("projectId", target.doc._id));
}

/**
 * Every event on a target, oldest first. The issue index orders by revision and an append
 * carries none, so time is the order here, for all four tables alike.
 */
export async function eventsOn(ctx: QueryCtx, target: Target): Promise<Doc<"events">[]> {
  const rows = await eventsQuery(ctx, target).collect();
  rows.sort((a, b) => a._creationTime - b._creationTime);
  return rows;
}

/** An event as every reader prints it: when, who, what kind, which revision, what changed. */
export type EventView = { at: number } & Pick<
  Doc<"events">,
  "actor" | "kind" | "revision" | "changes"
>;

/** The one projection of an event row every reader shares. */
export const eventView = (e: Doc<"events">): EventView => ({
  at: e._creationTime,
  actor: e.actor,
  kind: e.kind,
  revision: e.revision,
  changes: e.changes,
});
