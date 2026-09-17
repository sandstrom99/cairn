// readiness.ts: the one question `ready` asks of an issue, and the only three things
// that can answer yes — an open `blocks` edge into it, an unresolved blocker attached to
// it, a `deferUntil` still in the future (docs/design.md §3, §4).
//
// It lives here rather than inside ready.ts because epic health asks the same question of
// one issue at a time, and a second implementation of "is this blocked" is exactly the
// split that makes beads' readiness code unreadable. Nothing is stored: every call is
// index lookups over a graph of a few hundred documents.
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { LIVE } from "./lookup";
import { type Ref, issueView, ref } from "./views";

/** What holds an issue back. Ready is all three empty. */
export type Blocked = {
  /** The open or in-progress issues with a `blocks` edge into it. */
  issues: Ref[];
  /** The unresolved blockers attached to it. */
  blockers: Ref[];
  /** Its `deferUntil`, when that date has not arrived. */
  deferredUntil?: number;
};

/** Everything blocking `doc` right now, named in reference form. */
export async function blockedBy(
  ctx: QueryCtx,
  doc: Doc<"issues">,
  now: number = Date.now(),
): Promise<Blocked> {
  const incoming = await ctx.db
    .query("edges")
    .withIndex("by_to", (q) => q.eq("to", doc._id).eq("type", "blocks"))
    .collect();
  const sources = await Promise.all(incoming.map((e) => ctx.db.get(e.from)));

  const links = await ctx.db
    .query("blockerLinks")
    .withIndex("by_issue", (q) => q.eq("issueId", doc._id))
    .collect();
  const blockers = await Promise.all(links.map((l) => ctx.db.get(l.blockerId)));

  return {
    issues: sources
      .filter((i): i is Doc<"issues"> => i !== null && LIVE.includes(i.status))
      .map(ref),
    blockers: blockers
      .filter((b): b is Doc<"blockers"> => b !== null && b.status !== "resolved")
      .map(ref),
    ...(doc.deferUntil !== undefined && doc.deferUntil > now
      ? { deferredUntil: doc.deferUntil }
      : {}),
  };
}

/** True when nothing holds it back. */
export const isReady = (blocked: Blocked): boolean =>
  blocked.issues.length === 0 &&
  blocked.blockers.length === 0 &&
  blocked.deferredUntil === undefined;

/**
 * The ready rows themselves, in ready order, each marked with what `can` cannot satisfy.
 * `ready.list` is this function and nothing else, and `brief.get` counts the same rows,
 * so the head of the brief can never disagree with the list it is the head of.
 */
export async function readyIssues(
  ctx: QueryCtx,
  can: string[] | undefined,
  now: number = Date.now(),
) {
  const open = await ctx.db
    .query("issues")
    .withIndex("by_status", (q) => q.eq("status", "open"))
    .collect();

  const ready = [];
  for (const doc of open) if (isReady(await blockedBy(ctx, doc, now))) ready.push(doc);
  ready.sort((a, b) => a.priority - b.priority || a._creationTime - b._creationTime);

  const have = new Set(can ?? []);
  return await Promise.all(
    ready.map(async (doc) => ({
      ...(await issueView(ctx, doc)),
      cannot: doc.requires.filter((r) => !have.has(r)),
    })),
  );
}
