// journal.ts: when a claim last had anything journaled against it. The brief marks a claim
// quiet from it and `clock.next` counts the moment it will, so both read the one entry this
// reads, and a claim cannot turn quiet on the page at a moment the brief does not.
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * When an issue was last journaled, and `since`, when its claim last had anything journaled
 * against it: the later of the claim and the newest entry, so a claim taken a minute ago
 * over an issue journaled hours ago starts quiet from the claim, not from the entry.
 */
export async function lastJournaledAt(
  ctx: QueryCtx,
  doc: Doc<"issues">,
): Promise<{ lastJournal?: number; since: number }> {
  const newest = await ctx.db
    .query("journal")
    .withIndex("by_issue", (q) => q.eq("issueId", doc._id))
    .order("desc")
    .first();
  const lastJournal = newest?._creationTime;
  const since = Math.max(lastJournal ?? 0, doc.claimedAt ?? doc._creationTime);
  return { ...(lastJournal === undefined ? {} : { lastJournal }), since };
}
