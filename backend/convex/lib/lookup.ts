// lookup.ts: reading a document by its key, once: a public id, or for a project its slug.
// `by_public_id` plus `notFound` is the first line of nearly every verb, and it was copied
// into issues.ts and edges.ts before blockers.ts asked for a third: three copies of a
// two-line helper is where one of them starts drifting. The nullable `find…` forms exist
// for the callers that go on to create or to say "already exists".
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { notFound, projectNotFound } from "./errors";

/** The issue with that public id, or `not-found`. Every lifecycle verb starts here. */
export async function issueById(ctx: QueryCtx, id: string): Promise<Doc<"issues">> {
  const doc = await ctx.db
    .query("issues")
    .withIndex("by_public_id", (q) => q.eq("id", id))
    .unique();
  if (!doc) throw notFound(id);
  return doc;
}

/** The epic with that public id, or null. */
export async function findEpic(ctx: QueryCtx, id: string): Promise<Doc<"epics"> | null> {
  return await ctx.db
    .query("epics")
    .withIndex("by_public_id", (q) => q.eq("id", id))
    .unique();
}

/** The epic with that public id, or `not-found`. */
export async function epicById(ctx: QueryCtx, id: string): Promise<Doc<"epics">> {
  const doc = await findEpic(ctx, id);
  if (!doc) throw notFound(id);
  return doc;
}

/** The blocker with that public id, or `not-found`. */
export async function blockerById(ctx: QueryCtx, id: string): Promise<Doc<"blockers">> {
  const doc = await ctx.db
    .query("blockers")
    .withIndex("by_public_id", (q) => q.eq("id", id))
    .unique();
  if (!doc) throw notFound(id);
  return doc;
}

/** The project with that slug, or null. */
export async function findProject(ctx: QueryCtx, slug: string): Promise<Doc<"projects"> | null> {
  return await ctx.db
    .query("projects")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

/** The project with that slug, or `not-found` naming it as a project. */
export async function projectBySlug(ctx: QueryCtx, slug: string): Promise<Doc<"projects">> {
  const doc = await findProject(ctx, slug);
  if (!doc) throw projectNotFound(slug);
  return doc;
}
