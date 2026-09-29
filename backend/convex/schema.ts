// The one table registry. Every table cairn has is declared here and nowhere else;
// the model it holds is docs/design.md §3, field for field and index for index.
//
// Two ids on every issue, epic and blocker: `_id` is Convex's own and is what other
// tables reference, `id` is the public one (`app-14`, `ep-7`, `bl-3`) minted from
// `counters` inside the creating mutation. Nothing public ever prints `_id`.
// `_creationTime` is the created-at everywhere, so no table carries a `createdAt`.
// Convex reserves the index name `by_id`, which is why the public one is `by_public_id`.
// The literal unions come from lib/validators.ts, once, because the functions take the
// same ones as arguments.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { actorValidator } from "./lib/actor";
import { linkValidator } from "./lib/links";
import {
  blockerKindValidator,
  blockerStatusValidator,
  edgeTypeValidator,
  epicStatusValidator,
  followUpKindValidator,
  issueStatusValidator,
  issueTypeValidator,
  journalKindValidator,
} from "./lib/validators";
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
    // Absent means none: an epic with no links carries no empty array (lib/links.ts).
    links: v.optional(v.array(linkValidator)),
    status: epicStatusValidator,
    droppedReason: v.optional(v.string()),
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
    type: issueTypeValidator,
    followUpKind: v.optional(followUpKindValidator),
    parentIssueId: v.optional(v.id("issues")),
    // Unread and unwritten since cn-119 (docs/design.md §5): capabilities went on
    // 2026-09-29. It stays declared because every issue written before then carries it,
    // `[]` on most, and a schema that forbids it will not push over them. `patch.ts`
    // strips it, and cn-120 drops it once every deployment has run that.
    requires: v.optional(v.array(v.string())),
    // Absent means none: an issue with no links carries no empty array (lib/links.ts).
    links: v.optional(v.array(linkValidator)),
    status: issueStatusValidator,
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
    .index("by_parent", ["parentIssueId"]),

  // One direction only: `blocked-by` is a `blocks` row read through by_to.
  edges: defineTable({
    from: v.id("issues"),
    to: v.id("issues"),
    type: edgeTypeValidator,
    by: actorValidator,
  })
    .index("by_from", ["from", "type"])
    .index("by_to", ["to", "type"]),

  blockers: defineTable({
    id: v.string(),
    kind: blockerKindValidator,
    owner: v.string(),
    title: v.string(),
    whatResolves: v.string(),
    // Absent means none: a blocker with no links carries no empty array (lib/links.ts).
    links: v.optional(v.array(linkValidator)),
    nudgeAt: v.optional(v.number()),
    status: blockerStatusValidator,
    raisedBy: actorValidator,
    resolvedBy: v.optional(actorValidator),
    resolvedAt: v.optional(v.number()),
    resolution: v.optional(v.string()),
    // The person's words a resolve rests on, verbatim: required of an agent (blockers.ts).
    said: v.optional(v.string()),
    revision: v.number(),
  })
    .index("by_public_id", ["id"])
    .index("by_status", ["status"]),

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
    kind: journalKindValidator,
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
