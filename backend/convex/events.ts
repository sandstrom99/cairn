// events.ts: the one read over the audit trail that is not scoped to a single issue.
// What happened across the deployment, newest first — `cn log` prints it and the web
// window subscribes to it. Refs are resolved here, not left as Convex ids, because
// nothing outside the deployment knows what an issue, epic or blocker id even is.
//
// An edge is one event listed once. `edges.add` and `edges.remove` record it on both of
// its ends so that either issue's own history shows it (show.ts), and this read keeps the
// row on the end that leads the edge's sentence — `to` for `blocks`, the way `cn dep add
// cn-2 --blocked-by cn-1` asked for it, `from` for the rest — and drops its mirror. The
// mirror is dropped here rather than never written, because the history is what reads it.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
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

    const resolve = resolver(ctx);
    const out: LogEvent[] = [];
    // A page is `limit` rows, and a mirror row does not count towards it, so the read
    // walks on past a page that was short for that reason and stops at the table's end.
    let cursor = before;
    while (out.length < limit) {
      const page = await pageBefore(ctx, cursor, limit);
      if (page.length === 0) break;
      cursor = page[page.length - 1]!._creationTime;
      for (const e of page) {
        const issue = await resolve(e.issueId);
        if (isMirror(e, issue)) continue;
        out.push({
          at: e._creationTime,
          actor: e.actor,
          kind: e.kind,
          revision: e.revision,
          changes: e.changes,
          issue,
          epic: await resolve(e.epicId),
          blocker: await resolve(e.blockerId),
        });
        if (out.length === limit) break;
      }
    }
    return out;
  },
});

type LogEvent = {
  at: number;
  actor: Doc<"events">["actor"];
  kind: string;
  revision: number | undefined;
  changes: Doc<"events">["changes"];
  issue: Ref | undefined;
  epic: Ref | undefined;
  blocker: Ref | undefined;
};

/** The `limit` newest rows, or the `limit` newest before `cursor` once there is one. */
const pageBefore = (
  ctx: QueryCtx,
  cursor: number | undefined,
  limit: number,
): Promise<Doc<"events">[]> =>
  cursor === undefined
    ? ctx.db.query("events").order("desc").take(limit)
    : ctx.db
        .query("events")
        .withIndex("by_creation_time", (q) => q.lt("_creationTime", cursor))
        .order("desc")
        .take(limit);

/**
 * The second row of an edge: the one on the end that does not lead its sentence. The
 * subject of `blocks` is its `to` end and of every other type its `from` end, and the
 * row hangs on the issue `cn log` leads its line with, so the row whose issue is not
 * the subject is the mirror.
 */
const isMirror = (e: Doc<"events">, issue: Ref | undefined): boolean => {
  if (!e.kind.startsWith("edge.") || issue === undefined) return false;
  const changes = e.changes as { type?: string; from?: string; to?: string } | undefined;
  const subject = changes?.type === "blocks" ? changes.to : changes?.from;
  return subject !== undefined && subject !== issue.id;
};
