// changes.ts: what an event says a lifecycle move changed. Left to `applyRevision`'s own
// computed map, claim, release, close and drop would each record timestamps, `lastActivity`
// and a whole actor object — noise the event row does not need, since it already carries
// when and who. One helper per move, so the two release sites (issues.ts, reconcile.ts) and
// the two drop sites (issues.ts, epics.ts) cannot drift from each other. `createdChanges`
// is the create's, the public view minus `createdAt`, which the row's own time already
// says. Events written before this keep their raw maps: nothing migrates an audit trail.
import type { Doc } from "../_generated/dataModel";
import type { Actor } from "./actor";
import type { VerificationInput } from "./verification";

/** One field of a recorded change. An absent side was undefined, and is not stored. */
export type FieldChange = { from?: unknown; to?: unknown };
export type Changes = Record<string, FieldChange>;

/** The public fields of a just-created document, for an event's `changes`. */
export function createdChanges<T extends { createdAt: number }>(view: T): Omit<T, "createdAt"> {
  const copy: Record<string, unknown> = { ...view };
  delete copy.createdAt;
  return copy as Omit<T, "createdAt">;
}

export function claimChanges(doc: Doc<"issues">, actor: Actor): Changes {
  return {
    status: { from: doc.status, to: "in_progress" },
    claimedBy: { to: actor.name },
  };
}

export function releaseChanges(doc: Doc<"issues">): Changes {
  const changes: Changes = { status: { from: doc.status, to: "open" } };
  if (doc.claimedBy !== undefined) changes.claimedBy = { from: doc.claimedBy.name };
  return changes;
}

// Close and drop deliberately do not record `claimedBy` going away: ending an issue ends
// its claim, and the claim event already named who held it.

export function closeChanges(doc: Doc<"issues">, proof: VerificationInput): Changes {
  return {
    status: { from: doc.status, to: "closed" },
    verification: { to: verificationSummary(proof) },
  };
}

export function dropChanges(doc: Doc<"issues">, reason: string): Changes {
  return {
    status: { from: doc.status, to: "dropped" },
    droppedReason: { to: reason },
  };
}

/** One line for the event; the whole record, output included, stays on the issue. */
export function verificationSummary(proof: VerificationInput): string {
  if ("exitCode" in proof) return `${proof.command} (exit ${proof.exitCode})`;
  return `unverified: ${proof.unverified}`;
}
