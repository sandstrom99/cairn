// revision.ts: optimistic concurrency, and the rejection that makes it usable. Every
// mutable write to an issue, epic or blocker carries the revision the writer read. A
// stale one is not a failure a human is paged for: it comes back with every event since
// that revision — who changed what, and when — so the agent re-reads, decides and
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
): { issueId: Id<"issues"> } | { epicId: Id<"epics"> } | { blockerId: Id<"blockers"> } => {
  if (target.table === "issues") return { issueId: target.doc._id };
  if (target.table === "epics") return { epicId: target.doc._id };
  return { blockerId: target.doc._id };
};

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
  const doc = target.doc;
  if (doc.revision === revision) return;
  const since = (await eventsSince(ctx, target, revision)).map(eventView);
  throw stale(doc, revision, since);
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
  const revision = target.doc.revision + 1;
  // The checker reads `target.doc` through the conditional's constraint, which widens its
  // `_id` to an id of any of the three tables; `Target<T>` pins it to `T`'s.
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
