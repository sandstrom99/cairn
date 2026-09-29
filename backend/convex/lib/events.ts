// events.ts: the audit trail every mutation writes to. One row per action, carrying the
// revision the target moved to and what changed, so a stale write can be rejected with
// the real history rather than a reconstruction (docs/design.md §3, §9).
import type { Doc, Id } from "../_generated/dataModel";
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
  | "epic.update"
  | "epic.close"
  | "epic.drop"
  | "project.create"
  | "project.update"
  | "blocker.raise"
  | "blocker.attach"
  | "blocker.update"
  | "blocker.ack"
  | "blocker.resolve"
  | "edge.add"
  | "edge.remove"
  | "journal.append";

type EventInput = {
  /** issue.create, issue.claim, edge.add, blocker.resolve, … */
  kind: EventKind;
  actor: Actor;
  issueId?: Id<"issues">;
  epicId?: Id<"epics">;
  blockerId?: Id<"blockers">;
  projectId?: Id<"projects">;
  /** The revision the target moved to, absent for an insert-only action. */
  revision?: number;
  /** field → { from, to }, or the payload of the action. */
  changes: unknown;
};

/** Writes one `events` row. Every mutation calls this. */
export async function record(ctx: MutationCtx, event: EventInput): Promise<void> {
  await ctx.db.insert("events", { ...event });
}

/**
 * The second row of an edge: the one on the end that does not lead its sentence. The
 * subject of `blocks` is its `to` end and of every other type its `from` end, and the
 * row hangs on the issue `cn log` leads its line with, so the row whose issue is not
 * the subject is the mirror.
 */
export const isMirror = (e: Doc<"events">, issue: { id: string } | undefined): boolean => {
  if (!e.kind.startsWith("edge.") || issue === undefined) return false;
  const changes = e.changes as { type?: string; from?: string; to?: string } | undefined;
  const subject = changes?.type === "blocks" ? changes.to : changes?.from;
  return subject !== undefined && subject !== issue.id;
};
