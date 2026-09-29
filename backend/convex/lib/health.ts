// health.ts: the health line of docs/design.md §8 — what is moving, what is stuck, what
// waits on a person — each a fact with a query behind it and never a percentage. It lives
// here rather than in views.ts because it is a computation over a set of issues, an
// epic's or a project's, not the shape of one document; so is a project's pulse.
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isMirror } from "./events";
import { unresolvedBlockersOn } from "./graph";
import { idOrder } from "./order";
import { DAY, PULSE_DAYS, STUCK_AFTER_MS } from "./thresholds";
import { isLive } from "./validators";
import { epicView } from "./views";

/**
 * Every issue of an epic that is stuck: open, unclaimed, not deferred, silent strictly
 * longer than its priority's limit in STUCK_AFTER_MS, and held by no unresolved blocker,
 * most urgent first and silent longest within a priority. A priority with no limit is never
 * stuck. An issue a blocker holds is waiting, never stuck as well. The rule lives here
 * alone, so the epic's health and an issue's own state (`show.get`) name the same issues.
 */
export async function stuckOf(
  ctx: QueryCtx,
  issues: Doc<"issues">[],
  now: number,
): Promise<Doc<"issues">[]> {
  const silent = issues.filter((i) => {
    const limit = STUCK_AFTER_MS[i.priority];
    return (
      i.status === "open" &&
      i.claimedBy === undefined &&
      (i.deferUntil === undefined || i.deferUntil <= now) &&
      limit !== undefined &&
      now - i.lastActivity > limit
    );
  });
  const stuck: Doc<"issues">[] = [];
  for (const i of silent) {
    if ((await unresolvedBlockersOn(ctx, i._id)).length === 0) stuck.push(i);
  }
  return stuck.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.lastActivity - b.lastActivity ||
      a._creationTime - b._creationTime,
  );
}

/**
 * The three lines of design §8 over any set of issues, an epic's or a project's, so the
 * two cannot drift: what is moving, what is stuck, what waits on a person. Not a
 * percentage — an epic at 95% frozen for a month reads better than one at 40% advancing
 * daily, so each line is a fact with a query behind it.
 *
 * `stuck` is every open, unclaimed, undeferred issue no blocker holds that has been silent
 * past its priority's limit in STUCK_AFTER_MS, most urgent first: a set with nothing past
 * its limit has an empty list.
 */
export async function issueHealth(ctx: QueryCtx, issues: Doc<"issues">[], now: number) {
  const moving = issues
    .filter((i) => i.status === "in_progress")
    .map((i) => ({
      id: i.id,
      title: i.title,
      claimedBy: i.claimedBy!,
      claimedAt: i.claimedAt ?? i.lastActivity,
    }))
    .sort((a, b) => a.claimedAt - b.claimedAt);

  const stuck = (await stuckOf(ctx, issues, now)).map((i) => ({
    id: i.id,
    title: i.title,
    lastActivity: i.lastActivity,
  }));

  // One blocker can hold several of the issues, and it is one waiting line either way,
  // so the walk over blockerLinks deduplicates by blocker.
  const live = issues.filter(isLive);
  const seen = new Set<string>();
  const waiting: { id: string; title: string; owner: string }[] = [];
  for (const issue of live) {
    for (const blocker of await unresolvedBlockersOn(ctx, issue._id)) {
      if (seen.has(blocker._id)) continue;
      seen.add(blocker._id);
      waiting.push({ id: blocker.id, title: blocker.title, owner: blocker.owner });
    }
  }
  waiting.sort(idOrder);

  return { moving, stuck, waiting };
}

/**
 * The epic view, plus its health: the three lines `issueHealth` reads over the epic's
 * issues.
 *
 * `now` is the caller's clock when a subscriber sends one, because a subscription re-runs
 * on data and never on time.
 *
 * It takes the epic's issues preloaded, so a caller that already holds them (`show.get`,
 * `epics.list`) reads them once.
 *
 * `lastActivity` is the newest write to the epic or to any issue under it, as the issues
 * stamp it, so an edge or a blocker on its own moves nothing; the overview sorts by it.
 */
export async function epicHealth(
  ctx: QueryCtx,
  doc: Doc<"epics">,
  issues: Doc<"issues">[],
  now: number = Date.now(),
) {
  // The newest write to the epic or to anything under it, as the issues themselves stamp
  // it: a create, a claim, a close, an edit, a journal entry. An edge or a blocker stamps
  // nothing (edges.ts), which is the notion of activity the stuck line already measures
  // against. The epic's own events are its create, close or drop, which the index holds
  // beside each issue.create under it, read newest first. `_creationTime` carries a
  // fraction of a millisecond to order writes inside one; the floor makes it whole
  // milliseconds, as `Date.now()` stamps an issue's `lastActivity`.
  const own = await ctx.db
    .query("events")
    .withIndex("by_epic", (q) => q.eq("epicId", doc._id))
    .order("desc")
    .first();
  const lastActivity = Math.max(
    Math.floor(own?._creationTime ?? doc._creationTime),
    ...issues.map((i) => i.lastActivity),
  );

  return {
    ...epicView(doc, issues),
    lastActivity,
    health: await issueHealth(ctx, issues, now),
  };
}

/**
 * Each project's pulse (§8): for each of the last PULSE_DAYS days, oldest first, how many
 * events touched its issues and how many of those were `issue.close`, a drop not being a
 * close. It reads the window's events once across the table and counts an edge once, as
 * `cn log` does, skipping its mirror; an event that carries only a blocker or an epic
 * touches no issue and is not counted. A day is the 24 hours counted back from `now`, not
 * a calendar day, since cairn knows no time zone, and every project with an issue among
 * `issues` gets all PULSE_DAYS buckets, zeros included.
 */
export async function pulses(
  ctx: QueryCtx,
  issues: Doc<"issues">[],
  now: number,
): Promise<Map<Id<"projects">, { events: number; closes: number }[]>> {
  const out = new Map<Id<"projects">, { events: number; closes: number }[]>();
  const byId = new Map<Id<"issues">, Doc<"issues">>();
  for (const issue of issues) {
    byId.set(issue._id, issue);
    if (!out.has(issue.projectId))
      out.set(
        issue.projectId,
        Array.from({ length: PULSE_DAYS }, () => ({ events: 0, closes: 0 })),
      );
  }

  const events = await ctx.db
    .query("events")
    .withIndex("by_creation_time", (q) => q.gt("_creationTime", now - PULSE_DAYS * DAY))
    .collect();
  for (const e of events) {
    if (e.issueId === undefined) continue;
    const issue = byId.get(e.issueId);
    if (issue === undefined || isMirror(e, issue)) continue;
    const k = Math.floor(Math.max(0, now - e._creationTime) / DAY);
    if (k >= PULSE_DAYS) continue;
    const bucket = out.get(issue.projectId)![PULSE_DAYS - 1 - k]!;
    bucket.events += 1;
    if (e.kind === "issue.close") bucket.closes += 1;
  }
  return out;
}
