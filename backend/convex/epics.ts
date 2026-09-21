// epics.ts: an epic is an outcome, not a place, so it belongs to no project and carries
// no epic-to-epic edges. Its counts are computed from its issues on every read; there is
// no stored progress to go stale (docs/design.md §3, §5).
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { actorValidator } from "./lib/actor";
import { dropChanges } from "./lib/changes";
import { conflict, invalid } from "./lib/errors";
import { record } from "./lib/events";
import { mutation, query } from "./lib/guard";
import { mint } from "./lib/ids";
import { INBOX_ID } from "./lib/inbox";
import { nowArg } from "./lib/clock";
import { LIVE, epicById, issueOrder } from "./lib/lookup";
import { applyRevision, expectRevision } from "./lib/revision";
import { createdChanges, epicHealth, epicView, ref } from "./lib/views";

/** ep-7 sorts after ep-2, which a string sort does not do. */
const number = (doc: Doc<"epics">): number => Number(doc.id.slice("ep-".length));

export const create = mutation({
  args: { actor: actorValidator, title: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, { actor, title, description }) => {
    const n = await mint(ctx, "ep");
    const _id = await ctx.db.insert("epics", {
      id: `ep-${n}`,
      title,
      ...(description === undefined ? {} : { description }),
      status: "open",
      revision: 0,
    });
    const view = await epicView(ctx, (await ctx.db.get(_id))!);
    await record(ctx, {
      kind: "epic.create",
      actor,
      epicId: _id,
      revision: 0,
      changes: createdChanges(view),
    });
    return view;
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
    rows.sort((a, b) => number(a) - number(b));
    return await Promise.all(rows.map((doc) => epicHealth(ctx, doc, now)));
  },
});

/** One epic's health, the three lines of §8 with the counts above them. */
export const health = query({
  args: { id: v.string(), ...nowArg },
  handler: async (ctx, { id, now }) => epicHealth(ctx, await epicById(ctx, id), now),
});

/**
 * Closing an epic by hand, and dropping one with everything live in it.
 *
 * A close is refused while a task is open, naming every one of them: an epic is an
 * outcome, and an outcome with work left in it is not reached. Open follow-ups do not
 * refuse it — a follow-up is routed residue (§5), `cn ready` still lists it, and the
 * outcome it hangs off is done. Reconcile is stricter and waits for both (§7).
 *
 * `--drop --reason` is the other ending: the epic is not going to happen, so every live
 * issue in it is dropped with that reason first, each through `applyRevision` so each
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

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_epic", (q) => q.eq("epicId", doc._id))
      .collect();
    const live = issues.filter((i) => LIVE.includes(i.status));

    if (!args.drop) {
      const liveTasks = live.filter((i) => i.type === "task");
      if (liveTasks.length > 0)
        throw conflict(
          `${doc.id} "${doc.title}" has open work: ${liveTasks.map((i) => `${i.id} "${i.title}"`).join(", ")}`,
        );
      await applyRevision(
        ctx,
        { table: "epics", doc },
        { status: "closed" },
        { kind: "epic.close", actor: args.actor },
      );
      return { epic: await epicHealth(ctx, (await ctx.db.get(doc._id))!), dropped: [] };
    }

    const reason = args.reason ?? "";
    if (reason.trim() === "") throw invalid("dropping an epic needs --reason");

    const now = Date.now();
    live.sort(issueOrder);
    for (const issue of live)
      await applyRevision(
        ctx,
        { table: "issues", doc: issue },
        {
          status: "dropped",
          droppedReason: reason,
          closedAt: now,
          claimedBy: undefined,
          claimedAt: undefined,
          lastActivity: now,
        },
        { kind: "issue.drop", actor: args.actor, changes: dropChanges(issue, reason) },
      );
    await applyRevision(
      ctx,
      { table: "epics", doc },
      { status: "dropped", droppedReason: reason },
      { kind: "epic.drop", actor: args.actor },
    );
    return {
      epic: await epicHealth(ctx, (await ctx.db.get(doc._id))!),
      dropped: live.map(ref),
    };
  },
});
