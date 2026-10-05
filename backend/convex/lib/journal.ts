// journal.ts: when a claim last had anything journaled against it. The brief marks a claim
// quiet from it and `clock.next` counts the moment it will, so both read the one entry this
// reads, and a claim cannot turn quiet on the page at a moment the brief does not.
//
// It also holds the append itself, which `journal.append` and a close that leaves a
// direction both run, and the read of that direction: the newest `next` entry on a
// finished issue, which says where the one who finished it would take the work from there
// (docs/design.md §7). It is read beside the issue wherever the issue is the past of what
// is being looked at, and never stored anywhere else.
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Actor } from "./actor";
import { invalid } from "./errors";
import { record } from "./events";
import { type JournalKind, isLive } from "./validators";
import { type End, end } from "./views";

/**
 * One entry onto an issue's journal. A `next` entry is refused on a live issue: where a
 * live one stands is a `handoff`, and a direction is what a finished one leaves behind.
 */
export async function appendEntry(
  ctx: MutationCtx,
  actor: Actor,
  issue: Doc<"issues">,
  kind: JournalKind,
  body: string,
): Promise<Doc<"journal">> {
  if (body.trim() === "") throw invalid("a journal entry needs a body");
  if (kind === "next" && isLive(issue))
    throw invalid(
      `${issue.id} is ${issue.status}; a next entry is left on a finished issue, and a handoff says where a live one stands`,
    );

  const _id = await ctx.db.insert("journal", { issueId: issue._id, author: actor, kind, body });
  // A direct patch, not applyRevision: the revision belongs to the mutable fields, and
  // an append moves none of them.
  await ctx.db.patch(issue._id, { lastActivity: Date.now() });
  await record(ctx, {
    kind: "journal.append",
    actor,
    issueId: issue._id,
    // The whole body: `record` keeps its first line, the way every text in an event travels.
    changes: { kind, body },
  });
  return (await ctx.db.get(_id))!;
}

/** A direction as every answer carries it: the finished issue it was left on, the words, and who left them when. */
export type Direction = { from: End; body: string; by: Actor; at: number };

/**
 * The direction each of `issues` left, newest first: for every finished one, its newest
 * `next` entry. A live issue has none, and neither does a finished one nobody left one on.
 */
export async function directionsFrom(ctx: QueryCtx, issues: Doc<"issues">[]): Promise<Direction[]> {
  const left = await Promise.all(
    issues
      .filter((issue) => !isLive(issue))
      .map(async (issue) => {
        const entry = await ctx.db
          .query("journal")
          .withIndex("by_issue_kind", (q) => q.eq("issueId", issue._id).eq("kind", "next"))
          .order("desc")
          .first();
        return entry === null
          ? undefined
          : { from: end(issue), body: entry.body, by: entry.author, at: entry._creationTime };
      }),
  );
  return left
    .filter((direction): direction is Direction => direction !== undefined)
    .sort((a, b) => b.at - a.at);
}

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
