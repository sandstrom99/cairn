// brief.ts: the situation report a session opens with (docs/design.md §8), in one query.
// Counts and the head of each queue: what is ready, what is in progress and by whom, the
// follow-ups this session could actually finish, how much waits on a person, and what
// reconcile flagged.
//
// **It carries state and never doctrine.** The rules live in the skill, which loads on
// demand; a hook always loads, and beads' `bd prime` grew until it contradicted the skill
// shipped beside it. Nothing here tells an agent what to do.
//
// Follow-ups are the one place in cairn where `can[]` filters rather than marks, and the
// count says how many were left out. The brief is a glance, so a row this session cannot
// finish is noise in it; `cn ready` is the list, and it shows every row, marked (§5).
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { RECONCILE } from "./lib/actor";
import { readyIssues } from "./lib/readiness";

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

export const get = query({
  args: { can: v.optional(v.array(v.string())) },
  handler: async (ctx, { can }) => {
    const ready = await readyIssues(ctx, can ?? []);
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
          cannot: i.cannot,
        })),
      },
      inProgress: inProgress
        .sort((a, b) => (a.claimedAt ?? a._creationTime) - (b.claimedAt ?? b._creationTime))
        .map((doc) => ({
          id: doc.id,
          title: doc.title,
          claimedBy: doc.claimedBy,
          claimedAt: doc.claimedAt,
        })),
      followUps: {
        count: followUps.length,
        covered: followUps
          // `cannot` is already what `can` does not cover, so an empty one is coverage.
          .filter((i) => i.cannot.length === 0)
          .map((i) => ({
            id: i.id,
            title: i.title,
            followUpKind: i.followUpKind,
            requires: i.requires,
          })),
      },
      waiting: waiting.length,
      flagged: waiting.filter((b) => b.raisedBy.name === RECONCILE.name).length,
    };
  },
});
