// brief.ts: the situation report a session opens with (docs/design.md §8), in one query.
// Which projects the deployment has, as their slugs, then counts and the head of each
// queue: what is ready, what is in progress and by whom, the open follow-ups, and how
// much waits on a person. The ready heads carry what `cn ready`'s line prints, and `top`
// says how many: the brief's own three unless asked, the page asking for `UP_NEXT`.
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
import { lastJournaledAt } from "./lib/journal";
import { readyIssues } from "./lib/readiness";
import { quietAt, silentAt } from "./lib/thresholds";

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

/**
 * One in-progress row of the brief, and of `unjournaled`, so the two cannot disagree:
 * the claim, whether it is the asking session's, and the deployment's marks on it.
 */
async function heldRow(ctx: QueryCtx, doc: Doc<"issues">, actor: Actor | undefined, now: number) {
  return {
    id: doc.id,
    title: doc.title,
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
    const ready = await readyIssues(ctx, now);
    const tasks = ready.filter((i) => i.type === "task");
    const followUps = ready.filter((i) => i.type === "follow-up");

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
      ready: {
        count: tasks.length,
        top: tasks.slice(0, top).map((i) => ({
          id: i.id,
          title: i.title,
          priority: i.priority,
          status: i.status,
          epic: i.epic,
          revision: i.revision,
        })),
      },
      inProgress: await Promise.all(
        inProgress
          .sort((a, b) => (a.claimedAt ?? a._creationTime) - (b.claimedAt ?? b._creationTime))
          .map((doc) => heldRow(ctx, doc, actor, now)),
      ),
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
 * journal entry of each row that is this session's.
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
    return await Promise.all(
      held
        .sort((a, b) => (a.claimedAt ?? a._creationTime) - (b.claimedAt ?? b._creationTime))
        .map((doc) => heldRow(ctx, doc, actor, now)),
    );
  },
});
