// brief.ts: the situation report a session opens with (docs/design.md §8), in one query.
// Counts and the head of each queue: what is ready, what is in progress and by whom, the
// open follow-ups, and how much waits on a person.
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
// last one through `cn brief --unjournaled` and hands it back as one line (§8).
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { actorValidator, sameSession } from "./lib/actor";
import { nowArg } from "./lib/clock";
import { query } from "./lib/guard";
import { readyIssues } from "./lib/readiness";
import { CLAIM_SILENT_MS, JOURNAL_QUIET_MS } from "./lib/thresholds";

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
 * When an issue was last journaled, and when its claim last had anything journaled
 * against it: the later of the claim and the newest entry, so a claim taken a minute ago
 * over an issue journaled hours ago starts quiet from the claim, not from the entry.
 */
async function journalFacts(
  ctx: QueryCtx,
  doc: Doc<"issues">,
  now: number,
): Promise<{ lastJournal?: number; unjournaledSince?: number }> {
  const newest = await ctx.db
    .query("journal")
    .withIndex("by_issue", (q) => q.eq("issueId", doc._id))
    .order("desc")
    .first();
  const lastJournal = newest?._creationTime;
  const since = Math.max(lastJournal ?? 0, doc.claimedAt ?? doc._creationTime);
  return {
    ...(lastJournal === undefined ? {} : { lastJournal }),
    ...(now - since > JOURNAL_QUIET_MS ? { unjournaledSince: since } : {}),
  };
}

export const get = query({
  args: { actor: v.optional(actorValidator), ...nowArg },
  handler: async (ctx, { actor, now = Date.now() }) => {
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
      ready: {
        count: tasks.length,
        top: tasks.slice(0, TOP).map((i) => ({
          id: i.id,
          title: i.title,
          priority: i.priority,
        })),
      },
      inProgress: await Promise.all(
        inProgress
          .sort((a, b) => (a.claimedAt ?? a._creationTime) - (b.claimedAt ?? b._creationTime))
          .map(async (doc) => ({
            id: doc.id,
            title: doc.title,
            claimedBy: doc.claimedBy,
            claimedAt: doc.claimedAt,
            mine:
              actor !== undefined &&
              doc.claimedBy !== undefined &&
              sameSession(doc.claimedBy, actor),
            ...(now - doc.lastActivity > CLAIM_SILENT_MS ? { silentSince: doc.lastActivity } : {}),
            ...(await journalFacts(ctx, doc, now)),
          })),
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
