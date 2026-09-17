// lookup.ts: reading a document by its public id, once. `by_public_id` plus `notFound` is
// the first line of nearly every verb, and it was copied into issues.ts and edges.ts
// before blockers.ts asked for a third: three copies of a two-line helper is where one of
// them starts drifting. `LIVE` is here for the same reason — "open or in progress" is the
// same question in the lifecycle verbs, in readiness and in raising a blocker.
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { notFound } from "./errors";

/** The two statuses that are still work. A closed or dropped issue blocks nothing (§4). */
export const LIVE = ["open", "in_progress"];

/** The issue with that public id, or `not-found`. Every lifecycle verb starts here. */
export async function issueById(ctx: QueryCtx, id: string): Promise<Doc<"issues">> {
  const doc = await ctx.db
    .query("issues")
    .withIndex("by_public_id", (q) => q.eq("id", id))
    .unique();
  if (!doc) throw notFound(id);
  return doc;
}

/** The epic with that public id, or `not-found`. */
export async function epicById(ctx: QueryCtx, id: string): Promise<Doc<"epics">> {
  const doc = await ctx.db
    .query("epics")
    .withIndex("by_public_id", (q) => q.eq("id", id))
    .unique();
  if (!doc) throw notFound(id);
  return doc;
}

/** `cn-10` after `cn-2`, and one project's ids before another's: mint order, not string order. */
export const issueOrder = (a: { id: string }, b: { id: string }): number => {
  const [aSlug = "", aN = ""] = a.id.split(/-(?=\d+$)/);
  const [bSlug = "", bN = ""] = b.id.split(/-(?=\d+$)/);
  return aSlug.localeCompare(bSlug) || Number(aN) - Number(bN);
};

/** The blocker with that public id, or `not-found`. */
export async function blockerById(ctx: QueryCtx, id: string): Promise<Doc<"blockers">> {
  const doc = await ctx.db
    .query("blockers")
    .withIndex("by_public_id", (q) => q.eq("id", id))
    .unique();
  if (!doc) throw notFound(id);
  return doc;
}
