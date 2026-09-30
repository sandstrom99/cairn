// issueText.ts: the move of every issue's long text into the `issueText` table
// (lib/text.ts, docs/design.md §3). Every write puts the text there from the push that adds
// the table, so this is the one-off for the rows written before it, and the repair when a
// row is found still carrying its text. Run it once after that push:
// `vp run @cairn/backend#run:cloud -- issueText:move <name>` for a cloud deployment, and
// `node scripts/local.mjs run issueText:move` from `backend/` for the local one. Until it
// has run, every reader falls back to what the row carries, so nothing reads differently
// in between.
//
// It is an internal mutation rather than one through lib/guard: nothing outside the
// deployment can call it, so it needs no secret, and running it twice moves nothing the
// second time.
//
// It is one transaction over every issue, which is fine at thousands; a deployment with
// far more would outgrow Convex's per-transaction read limit, and would want the walk
// split into pages.
import { internalMutation } from "./_generated/server";
import { moveText } from "./lib/text";

export const move = internalMutation({
  args: {},
  handler: async (ctx) => {
    const issues = await ctx.db.query("issues").collect();
    let moved = 0;
    for (const doc of issues) if (await moveText(ctx, doc)) moved += 1;
    return { moved, issues: issues.length };
  },
});
