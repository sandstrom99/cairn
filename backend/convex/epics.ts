// epics.ts: an epic is an outcome, not a place, so it belongs to no project and carries
// no epic-to-epic edges. Its counts are computed from its issues on every read; there is
// no stored progress to go stale (docs/design.md §3, §5).
import { v } from "convex/values";
import { actorValidator } from "./lib/actor";
import { conflict, invalid } from "./lib/errors";
import { mutation, query } from "./lib/guard";
import { issuesIn } from "./lib/graph";
import { mint } from "./lib/ids";
import { INBOX_ID } from "./lib/inbox";
import { nowArg } from "./lib/clock";
import { epicHealth } from "./lib/health";
import { closeEpic, dropEpic, dropIssue, insertEpic } from "./lib/lifecycle";
import { epicById } from "./lib/lookup";
import { idOrder } from "./lib/order";
import { expectRevision } from "./lib/revision";
import { isLive } from "./lib/validators";
import { epicView, ref } from "./lib/views";

export const create = mutation({
  args: { actor: actorValidator, title: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, { actor, title, description }) => {
    const n = await mint(ctx, "ep");
    const doc = await insertEpic(ctx, actor, { id: `ep-${n}`, title, description });
    return epicView(doc, []);
  },
});

export const list = query({
  args: { all: v.optional(v.boolean()), ...nowArg },
  handler: async (ctx, { all, now }) => {
    const rows = all
      ? await ctx.db.query("epics").collect()
      : await ctx.db
          .query("epics")
          .withIndex("by_status", (q) => q.eq("status", "open"))
          .collect();
    rows.sort(idOrder);
    return await Promise.all(
      rows.map(async (doc) => epicHealth(ctx, doc, await issuesIn(ctx, doc._id), now)),
    );
  },
});

/**
 * Closing an epic by hand, and dropping one with everything live in it.
 *
 * A close is refused while a task is open, naming every one of them: an epic is an
 * outcome, and an outcome with work left in it is not reached. Open follow-ups do not
 * refuse it — a follow-up is routed residue (§5), `cn ready` still lists it, and the
 * outcome it hangs off is done. The offer in `issues.close` is stricter and waits for
 * follow-ups too (§7).
 *
 * `--drop --reason` is the other ending: the epic is not going to happen, so every live
 * issue in it is dropped with that reason first, each through `dropIssue` so each
 * carries its own `issue.drop` event.
 */
export const close = mutation({
  args: {
    actor: actorValidator,
    id: v.string(),
    revision: v.number(),
    drop: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await epicById(ctx, args.id);
    if (doc.id === INBOX_ID) throw invalid("ep-0 is the inbox; it does not close");
    await expectRevision(ctx, { table: "epics", doc }, args.revision);
    if (doc.status !== "open") throw invalid(`${doc.id} is already ${doc.status}`);

    const issues = await issuesIn(ctx, doc._id);
    const live = issues.filter(isLive);

    if (!args.drop) {
      const liveTasks = live.filter((i) => i.type === "task");
      if (liveTasks.length > 0)
        throw conflict(
          `${doc.id} "${doc.title}" has open work: ${liveTasks.map((i) => `${i.id} "${i.title}"`).join(", ")}`,
        );
      const closed = await closeEpic(ctx, args.actor, doc);
      // Only the epic moved, so the issues read above are still the ones in it.
      return { epic: await epicHealth(ctx, closed, issues), dropped: [] };
    }

    const reason = args.reason ?? "";
    if (reason.trim() === "") throw invalid("dropping an epic needs --reason");

    live.sort(idOrder);
    for (const issue of live) await dropIssue(ctx, args.actor, issue, reason);
    const dropped = await dropEpic(ctx, args.actor, doc, reason);
    // Every live issue was just dropped, so the rows read above are stale: read them again.
    return {
      epic: await epicHealth(ctx, dropped, await issuesIn(ctx, doc._id)),
      dropped: live.map(ref),
    };
  },
});
