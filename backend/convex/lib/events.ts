// events.ts: the audit trail every mutation writes to. One row per action, carrying the
// revision the target moved to and what changed, so a stale write can be rejected with
// the real history rather than a reconstruction (docs/design.md §3, §9).
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./actor";

export type EventInput = {
  /** issue.create, issue.claim, edge.add, blocker.resolve, … */
  kind: string;
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
