// pulse.ts: the recount of the `pulse` table from the events (docs/design.md §8). Each
// event is counted into its project's pulse in the mutation that writes it (lib/events.ts),
// so this is the backfill for a deployment that had events before the table did, and the
// repair when the counts are doubted. Run it once after the push that adds the table:
// `vp run @cairn/backend#run:cloud -- pulse:rebuild <name>` for a cloud deployment, and
// `node scripts/local.mjs run pulse:rebuild` from `backend/` for the local one.
//
// It is an internal mutation rather than one through lib/guard: nothing outside the
// deployment can call it, so it needs no secret, and running it twice counts the same.
//
// It is one transaction over every event and every issue, which is fine at thousands of
// each; a deployment with far more would outgrow Convex's per-transaction read limit, and
// would want the walk split into pages.
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { countEvent } from "./lib/events";

export const rebuild = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db.query("pulse").collect()) await ctx.db.delete(row._id);

    const issues = new Map<Id<"issues">, Doc<"issues">>();
    for (const issue of await ctx.db.query("issues").collect()) issues.set(issue._id, issue);

    for (const e of await ctx.db.query("events").collect()) {
      if (e.issueId !== undefined) await countEvent(ctx, e, issues.get(e.issueId), e._creationTime);
    }

    // What landed in the table, read back, so `events` is what was counted: an edge's
    // mirror and an event on an issue that is gone are walked past and not counted.
    const rows = await ctx.db.query("pulse").collect();
    return { events: rows.reduce((sum, row) => sum + row.events, 0), rows: rows.length };
  },
});
