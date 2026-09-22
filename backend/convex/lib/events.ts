// events.ts: the audit trail every mutation writes to. One row per action, carrying the
// revision the target moved to and what changed, so a stale write can be rejected with
// the real history rather than a reconstruction (docs/design.md §3, §9).
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./actor";

/**
 * Every kind of event the deployment writes. The table's `kind` stays a string, since rows
 * written before a kind existed and the CLI both read it as one.
 */
export type EventKind =
  | "issue.create"
  | "issue.claim"
  | "issue.release"
  | "issue.update"
  | "issue.close"
  | "issue.drop"
  | "epic.create"
  | "epic.close"
  | "epic.drop"
  | "project.create"
  | "blocker.raise"
  | "blocker.attach"
  | "blocker.ack"
  | "blocker.resolve"
  | "edge.add"
  | "edge.remove"
  | "journal.append"
  | "reconcile.run"
  | "reconcile.sweep";

export type EventInput = {
  /** issue.create, issue.claim, edge.add, blocker.resolve, … */
  kind: EventKind;
  actor: Actor;
  issueId?: Id<"issues">;
  epicId?: Id<"epics">;
  blockerId?: Id<"blockers">;
  /** The revision the target moved to, absent for an insert-only action. */
  revision?: number;
  /** field → { from, to }, or the payload of the action. */
  changes: unknown;
};

/** Writes one `events` row. Every mutation calls this. */
export async function record(ctx: MutationCtx, event: EventInput): Promise<void> {
  await ctx.db.insert("events", { ...event });
}
