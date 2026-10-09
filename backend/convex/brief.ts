// brief.ts: the situation report a session opens with (docs/design.md §8), in one query.
// Which projects the deployment has, as their slugs, then counts and the head of each
// queue: what is ready, what is stuck, what is in progress and by whom, what was closed in
// the last RECENT_MS, the open follow-ups, and how much waits on a person. `ready` leaves
// out the rows the stuck rule names, so a row is in one of the two and never both. Every
// head carries what `cn ready`'s line prints, and `top` says how many: the brief's own
// three unless asked, the page asking for `UP_NEXT`.
//
// **It carries state and never doctrine.** The rules live in the skill, which loads on
// demand; a hook always loads, and beads' `bd prime` grew until it contradicted the skill
// shipped beside it. Nothing here tells an agent what to do.
//
// The in-progress rows carry the facts the deployment alone can state: `mine`, that the
// claim belongs to the asking session — the same test `issues.claim` is idempotent on, so
// the brief and the claim cannot disagree about whose it is — `silentSince`, the last
// activity of a claim silent past CLAIM_SILENT_MS, which a person reads and decides on;
// nothing releases it (§7) — and `lastJournal` with `unjournaledSince`, when the issue was
// last journaled and, past JOURNAL_QUIET_MS counted from the later of the claim and that
// entry, the moment nothing has been journaled since. The plugin's Stop hook reads the
// last one through `cn brief --unjournaled`, which calls `brief.unjournaled`: the
// in-progress rows this session holds and nothing more, handed back as one line (§8).
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { type Actor, actorValidator, sameSession } from "./lib/actor";
import { nowArg } from "./lib/clock";
import { query } from "./lib/guard";
import { stuckOf } from "./lib/health";
import { lastJournaledAt } from "./lib/journal";
import { readyIssues } from "./lib/readiness";
import { fadedAt, quietAt, silentAt } from "./lib/thresholds";
import { type IssueView, type Lookups, issueView, lookups } from "./lib/views";

/**
 * The blockers in one unresolved status. Both lines over them are counts, so the order
 * is whatever the index gives.
 */
const blockersWith = async (
  ctx: QueryCtx,
  status: "raised" | "waiting",
): Promise<Doc<"blockers">[]> =>
  await ctx.db
    .query("blockers")
    .withIndex("by_status", (q) => q.eq("status", status))
    .collect();

/** How many ready rows head the brief: three, as §8 spells it. */
const TOP = 3;

/**
 * When an issue was last journaled, and, once its claim reads quiet, since when nothing has
 * been: the later of the claim and the newest entry, as lib/journal.ts reads them for
 * `clock.next` too.
 */
async function journalFacts(
  ctx: QueryCtx,
  doc: Doc<"issues">,
  now: number,
): Promise<{ lastJournal?: number; unjournaledSince?: number }> {
  const { lastJournal, since } = await lastJournaledAt(ctx, doc);
  return {
    ...(lastJournal === undefined ? {} : { lastJournal }),
    ...(quietAt(since) <= now ? { unjournaledSince: since } : {}),
  };
}

/** One head of a queue: what an issue's line prints, and when it last moved and closed. */
const head = (view: IssueView) => ({
  id: view.id,
  title: view.title,
  priority: view.priority,
  status: view.status,
  epic: view.epic,
  revision: view.revision,
  lastActivity: view.lastActivity,
  ...(view.closedAt === undefined ? {} : { closedAt: view.closedAt }),
});

/**
 * One in-progress row of the brief, and of `unjournaled`, so the two cannot disagree:
 * the issue's line, the claim, whether it is the asking session's, and the deployment's
 * marks on it.
 */
async function heldRow(
  ctx: QueryCtx,
  doc: Doc<"issues">,
  actor: Actor | undefined,
  now: number,
  seen: Lookups,
) {
  return {
    ...head(await issueView(ctx, doc, seen)),
    claimedBy: doc.claimedBy,
    claimedAt: doc.claimedAt,
    mine: actor !== undefined && doc.claimedBy !== undefined && sameSession(doc.claimedBy, actor),
    ...(silentAt(doc.lastActivity) <= now ? { silentSince: doc.lastActivity } : {}),
    ...(await journalFacts(ctx, doc, now)),
  };
}

export const get = query({
  args: { actor: v.optional(actorValidator), top: v.optional(v.number()), ...nowArg },
  handler: async (ctx, { actor, now = Date.now(), top = TOP }) => {
    const seen = lookups();
    const open = await ctx.db
      .query("issues")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const stuck = await stuckOf(ctx, open, now);
    const stuckIds = new Set(stuck.map((doc) => doc.id));

    // The follow-ups line keeps every ready follow-up, stuck or not: it exists so a follow-up
    // is never lost, and the stuck line's three heads would hide one behind older rows.
    const ready = await readyIssues(ctx, now);
    const tasks = ready.filter((i) => i.type === "task" && !stuckIds.has(i.id));
    const followUps = ready.filter((i) => i.type === "follow-up");

    // Filtered in memory, as `countsOf` in lib/views.ts filters by `closedAt`: there is no
    // `closedAt` index on purpose. A dropped issue carries a `closedAt` too, and is no close.
    const recent = (
      await ctx.db
        .query("issues")
        .withIndex("by_status", (q) => q.eq("status", "closed"))
        .collect()
    )
      .filter((doc) => doc.closedAt !== undefined && fadedAt(doc.closedAt) > now)
      .sort((a, b) => b.closedAt! - a.closedAt!);

    const inProgress = await ctx.db
      .query("issues")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();

    const waiting = [
      ...(await blockersWith(ctx, "raised")),
      ...(await blockersWith(ctx, "waiting")),
    ];

    return {
      projects: (await ctx.db.query("projects").withIndex("by_slug").collect()).map((p) => p.slug),
      ready: { count: tasks.length, top: tasks.slice(0, top).map(head) },
      // `stuckOf`'s order, most urgent first and silent longest within a priority. The
      // silence is the row's last activity, which the page's meter draws.
      stuck: {
        count: stuck.length,
        top: await Promise.all(
          stuck.slice(0, top).map(async (doc) => ({
            ...head(await issueView(ctx, doc, seen)),
            silentSince: doc.lastActivity,
          })),
        ),
      },
      inProgress: await Promise.all(
        inProgress
          .sort((a, b) => (a.claimedAt ?? a._creationTime) - (b.claimedAt ?? b._creationTime))
          .map((doc) => heldRow(ctx, doc, actor, now, seen)),
      ),
      recent: {
        count: recent.length,
        top: await Promise.all(
          recent.slice(0, top).map(async (doc) => head(await issueView(ctx, doc, seen))),
        ),
      },
      followUps: followUps.map((i) => ({
        id: i.id,
        title: i.title,
        followUpKind: i.followUpKind,
      })),
      waiting: waiting.length,
    };
  },
});

/**
 * The in-progress rows this session holds, each with the brief's marks, and nothing else
 * read: what the Stop hook asks at the end of every turn through `cn brief --unjournaled`,
 * where `brief.get` walked readiness over every open issue to answer a question about
 * this session's own claims. Only `by_status` for `in_progress` is read, then the newest
 * journal entry, the project, the epic and any parent of each row that is this session's.
 */
export const unjournaled = query({
  args: { actor: actorValidator, ...nowArg },
  handler: async (ctx, { actor, now = Date.now() }) => {
    const held = (
      await ctx.db
        .query("issues")
        .withIndex("by_status", (q) => q.eq("status", "in_progress"))
        .collect()
    ).filter((doc) => doc.claimedBy !== undefined && sameSession(doc.claimedBy, actor));
    // Every row is `mine` by construction, and in the brief's order.
    const seen = lookups();
    return await Promise.all(
      held
        .sort((a, b) => (a.claimedAt ?? a._creationTime) - (b.claimedAt ?? b._creationTime))
        .map((doc) => heldRow(ctx, doc, actor, now, seen)),
    );
  },
});
