// events.ts: the one read over the audit trail that is not scoped to a single issue.
// What happened across the deployment, newest first — `cn log` prints it and the web
// window subscribes to it. Refs are resolved here, not left as Convex ids, because
// nothing outside the deployment knows what an issue, epic or blocker id even is.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { invalid } from "./lib/errors";
import { query } from "./lib/guard";
import { type Ref, ref } from "./lib/views";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/**
 * Resolves a Convex id to its Ref, once per call: fifty events usually name a handful of
 * issues. The cache holds the promise rather than the value, because the rows resolve
 * side by side and a value would not be there yet when the second row asks. A referenced
 * document that no longer exists comes back undefined, not a throw — the event still
 * happened.
 */
function resolver(ctx: QueryCtx) {
  const cache = new Map<string, Promise<Ref | undefined>>();
  return function resolve<T extends "issues" | "epics" | "blockers">(
    id: Id<T> | undefined,
  ): Promise<Ref | undefined> {
    if (id === undefined) return Promise.resolve(undefined);
    const key = id as unknown as string;
    const held = cache.get(key);
    if (held) return held;
    // `Doc<T>` for a generic `T` does not structurally show `id`/`title` to the checker,
    // though every one of the three tables it can be carries both.
    const found = (ctx.db.get(id) as Promise<{ id: string; title: string } | null>).then((doc) =>
      doc ? ref(doc) : undefined,
    );
    cache.set(key, found);
    return found;
  };
}

export const recent = query({
  args: { limit: v.optional(v.number()), before: v.optional(v.number()) },
  handler: async (ctx, { limit = DEFAULT_LIMIT, before }) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
      throw invalid(`limit is a whole number from 1 to ${MAX_LIMIT}, not ${limit}`);

    const rows =
      before === undefined
        ? await ctx.db.query("events").order("desc").take(limit)
        : await ctx.db
            .query("events")
            .withIndex("by_creation_time", (q) => q.lt("_creationTime", before))
            .order("desc")
            .take(limit);

    const resolve = resolver(ctx);
    return await Promise.all(
      rows.map(async (e) => ({
        at: e._creationTime,
        actor: e.actor,
        kind: e.kind,
        revision: e.revision,
        changes: e.changes,
        issue: await resolve(e.issueId),
        epic: await resolve(e.epicId),
        blocker: await resolve(e.blockerId),
      })),
    );
  },
});
