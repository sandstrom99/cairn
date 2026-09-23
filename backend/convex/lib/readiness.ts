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
import { edgesTo, unresolvedBlockersOn } from "./graph";
import { priorityOrder } from "./order";
import { isLive } from "./validators";
import { type Ref, issueView, ref } from "./views";

/** What holds an issue back. Ready is all three empty. */
type Blocked = {
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
  const incoming = await edgesTo(ctx, doc._id, "blocks");
  const sources = await Promise.all(incoming.map((e) => ctx.db.get(e.from)));

  return {
    issues: sources.filter((i): i is Doc<"issues"> => i !== null && isLive(i)).map(ref),
    blockers: (await unresolvedBlockersOn(ctx, doc._id)).map(ref),
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
 *
 * `now` is the caller's clock when a subscriber sends one, because a subscription re-runs
 * on data and never on time.
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
  ready.sort(priorityOrder);

  const have = new Set(can ?? []);
  return await Promise.all(
    ready.map(async (doc) => ({
      ...(await issueView(ctx, doc)),
      cannot: doc.requires.filter((r) => !have.has(r)),
    })),
  );
}
