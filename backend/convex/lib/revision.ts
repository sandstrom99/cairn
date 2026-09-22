// revision.ts: optimistic concurrency, and the rejection that makes it usable. Every
// mutable write to an issue, epic or blocker carries the revision the writer read. A
// stale one is not a failure a human is paged for: it comes back with every event since
// that revision — who changed what, and when — so the agent re-reads, decides and
// retries (docs/design.md §9). A journal append is an insert and takes no revision.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Actor } from "./actor";
import { stale } from "./errors";
import { record } from "./events";
import { type Target, eventView, eventsOn } from "./graph";

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
 * Patches the target, bumps its revision by one, records the change. Returns the new
 * revision. `changes` replaces the computed `{ field: { from, to } }` map when the patch
 * is not what the reader should see: an epic change patches `epicId` and is recorded as
 * the two public ids, because nothing outside the deployment knows a Convex id.
 */
export async function applyRevision(
  ctx: MutationCtx,
  target: Target,
  patch: Record<string, unknown>,
  { kind, actor, changes }: { kind: string; actor: Actor; changes?: unknown },
): Promise<number> {
  const revision = target.doc.revision + 1;
  const before = target.doc as unknown as Record<string, unknown>;
  const computed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, to] of Object.entries(patch)) computed[field] = { from: before[field], to };

  const next = { ...patch, revision };
  if (target.table === "issues") await ctx.db.patch(target.doc._id, next as Partial<Doc<"issues">>);
  else if (target.table === "epics")
    await ctx.db.patch(target.doc._id, next as Partial<Doc<"epics">>);
  else await ctx.db.patch(target.doc._id, next as Partial<Doc<"blockers">>);

  await record(ctx, {
    kind,
    actor,
    ...targetKey(target),
    revision,
    changes: changes ?? computed,
  });
  return revision;
}
