// epics.ts: an epic is an outcome, not a place, so it belongs to no project and carries
// no epic-to-epic edges. Its counts are computed from its issues on every read; there is
// no stored progress to go stale (docs/design.md §3, §5).
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { actorValidator } from "./lib/actor";
import { record } from "./lib/events";
import { mint } from "./lib/ids";
import { createdChanges, epicView } from "./lib/views";

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
  args: { all: v.optional(v.boolean()) },
  handler: async (ctx, { all }) => {
    const rows = all
      ? await ctx.db.query("epics").collect()
      : await ctx.db
          .query("epics")
          .withIndex("by_status", (q) => q.eq("status", "open"))
          .collect();
    rows.sort((a, b) => number(a) - number(b));
    return await Promise.all(rows.map((doc) => epicView(ctx, doc)));
  },
});
