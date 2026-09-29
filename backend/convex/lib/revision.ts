// revision.ts: optimistic concurrency, and the rejection that makes it usable. Every
// mutable write to an issue, epic, blocker or project carries the revision the writer
// read. A stale one is not a failure a human is paged for: it comes back with every event
// since that revision — who changed what, and when — so the agent re-reads, decides and
// retries (docs/design.md §9). A journal append is an insert and takes no revision.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Actor } from "./actor";
import { stale } from "./errors";
import { type EventKind, record } from "./events";
import { type Revisioned, type Target, eventView, eventsOn } from "./graph";

/** The event row's foreign key for this target, the one key `record` needs. */
const targetKey = (
  target: Target,
):
  | { issueId: Id<"issues"> }
  | { epicId: Id<"epics"> }
  | { blockerId: Id<"blockers"> }
  | { projectId: Id<"projects"> } => {
  if (target.table === "issues") return { issueId: target.doc._id };
  if (target.table === "epics") return { epicId: target.doc._id };
  if (target.table === "blockers") return { blockerId: target.doc._id };
  return { projectId: target.doc._id };
};

/** The revision a target is at. A project made before cn-125 has none stored, and reads 0. */
const revisionOf = (target: Target): number => target.doc.revision ?? 0;

/** What a stale write names: an issue's, epic's or blocker's id, or a project's slug. */
const nameOf = (target: Target): string =>
  target.table === "projects" ? target.doc.slug : target.doc.id;

/** Every event on the target past `revision`, newest last. */
async function eventsSince(
  ctx: QueryCtx,
  target: Target,
  revision: number,
): Promise<Doc<"events">[]> {
  return (await eventsOn(ctx, target)).filter(
    (e) => e.revision !== undefined && e.revision > revision,
  );
}

/** Throws `kind: "stale"` with the history since `revision`, or returns having agreed. */
export async function expectRevision(
  ctx: QueryCtx,
  target: Target,
  revision: number,
): Promise<void> {
  if (revisionOf(target) === revision) return;
  const since = (await eventsSince(ctx, target, revision)).map(eventView);
  throw stale({ id: nameOf(target), revision: revisionOf(target) }, revision, since);
}

/**
 * Patches the target, bumps its revision by one, and records exactly the `changes` it is
 * given, computing nothing: what an event says is the calling helper's, in lib/lifecycle.ts.
 * Returns the patched document, so no caller reads it again after the write.
 */
export async function applyRevision<T extends Revisioned>(
  ctx: MutationCtx,
  target: Target<T>,
  patch: Partial<Doc<T>>,
  event: { kind: EventKind; actor: Actor; changes: unknown },
): Promise<Doc<T>> {
  const revision = revisionOf(target) + 1;
  // The checker reads `target.doc` through the conditional's constraint, which widens its
  // `_id` to an id of any of the four tables; `Target<T>` pins it to `T`'s.
  const id = target.doc._id as Id<T>;
  await ctx.db.patch(id, { ...patch, revision });
  await record(ctx, {
    kind: event.kind,
    actor: event.actor,
    ...targetKey(target),
    revision,
    changes: event.changes,
  });
  return (await ctx.db.get(id))!;
}
