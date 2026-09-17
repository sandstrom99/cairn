// The one table registry. Every table cairn has is declared here and nowhere else;
// the model it holds is docs/design.md §3, field for field and index for index.
//
// Two ids on every issue, epic and blocker: `_id` is Convex's own and is what other
// tables reference, `id` is the public one (`app-14`, `ep-7`, `bl-3`) minted from
// `counters` inside the creating mutation. Nothing public ever prints `_id`.
// `_creationTime` is the created-at everywhere, so no table carries a `createdAt`.
// Convex reserves the index name `by_id`, which is why the public one is `by_public_id`.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { actorValidator } from "./lib/actor";
import { verificationValidator } from "./lib/verification";

export default defineSchema({
  projects: defineTable({
    slug: v.string(),
    name: v.string(),
  }).index("by_slug", ["slug"]),

  counters: defineTable({
    key: v.string(),
    next: v.number(),
  }).index("by_key", ["key"]),

  // No projectId: an epic is an outcome, not a place. ep-0 is the one inbox.
  epics: defineTable({
    id: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("closed"), v.literal("dropped")),
    droppedReason: v.optional(v.string()),
    lastReconciledAt: v.optional(v.number()),
    revision: v.number(),
  })
    .index("by_public_id", ["id"])
    .index("by_status", ["status"]),

  issues: defineTable({
    id: v.string(),
    projectId: v.id("projects"),
    epicId: v.id("epics"),
    title: v.string(),
    description: v.optional(v.string()),
    design: v.optional(v.string()),
    acceptance: v.optional(v.string()),
    type: v.union(v.literal("task"), v.literal("follow-up")),
    followUpKind: v.optional(
      v.union(v.literal("verify"), v.literal("decide"), v.literal("cleanup")),
    ),
    parentIssueId: v.optional(v.id("issues")),
    requires: v.array(v.string()),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("closed"),
      v.literal("dropped"),
    ),
    priority: v.number(),
    claimedBy: v.optional(actorValidator),
    claimedAt: v.optional(v.number()),
    lastActivity: v.number(),
    deferUntil: v.optional(v.number()),
    verification: v.optional(verificationValidator),
    droppedReason: v.optional(v.string()),
    closedAt: v.optional(v.number()),
    revision: v.number(),
  })
    .index("by_public_id", ["id"])
    .index("by_epic", ["epicId", "status"])
    .index("by_project", ["projectId", "status"])
    .index("by_status", ["status", "priority"])
    .index("by_activity", ["status", "lastActivity"])
    .index("by_parent", ["parentIssueId"]),

  // One direction only: `blocked-by` is a `blocks` row read through by_to.
  edges: defineTable({
    from: v.id("issues"),
    to: v.id("issues"),
    type: v.union(
      v.literal("blocks"),
      v.literal("related"),
      v.literal("discovered-from"),
      v.literal("duplicates"),
      v.literal("supersedes"),
    ),
    by: actorValidator,
  })
    .index("by_from", ["from", "type"])
    .index("by_to", ["to", "type"]),

  blockers: defineTable({
    id: v.string(),
    kind: v.union(
      v.literal("approval"),
      v.literal("external-wait"),
      v.literal("decision"),
      v.literal("credential"),
      v.literal("purchase"),
    ),
    owner: v.string(),
    title: v.string(),
    whatResolves: v.string(),
    nudgeAt: v.optional(v.number()),
    status: v.union(v.literal("raised"), v.literal("waiting"), v.literal("resolved")),
    raisedBy: actorValidator,
    resolvedBy: v.optional(actorValidator),
    resolvedAt: v.optional(v.number()),
    resolution: v.optional(v.string()),
    revision: v.number(),
  })
    .index("by_public_id", ["id"])
    .index("by_status", ["status", "nudgeAt"]),

  blockerLinks: defineTable({
    blockerId: v.id("blockers"),
    issueId: v.id("issues"),
  })
    .index("by_issue", ["issueId"])
    .index("by_blocker", ["blockerId"]),

  // Insert only. Nothing ever updates a journal entry, which is why it cannot lose one.
  journal: defineTable({
    issueId: v.id("issues"),
    author: actorValidator,
    kind: v.union(
      v.literal("finding"),
      v.literal("decision"),
      v.literal("handoff"),
      v.literal("evidence"),
      v.literal("question"),
    ),
    body: v.string(),
  }).index("by_issue", ["issueId"]),

  events: defineTable({
    kind: v.string(),
    actor: actorValidator,
    issueId: v.optional(v.id("issues")),
    epicId: v.optional(v.id("epics")),
    blockerId: v.optional(v.id("blockers")),
    revision: v.optional(v.number()),
    changes: v.any(),
  })
    .index("by_issue", ["issueId", "revision"])
    .index("by_epic", ["epicId"])
    .index("by_blocker", ["blockerId"]),
});
