// patch.ts: a one-off, run once against the worklist deployment and then deleted with
// the field it removes (docs/design.md §7, cn-62).
//
//   npx convex run --env-file .env.cloud.local patch:dropLastReconciledAt
//
// Internal, so no client can reach it; it takes no actor and writes no event, because
// it changes nothing anyone reads: `lastReconciledAt` has been unread since 2026-09-22.
import { internalMutation } from "./_generated/server";

export const dropLastReconciledAt = internalMutation({
  args: {},
  handler: async (ctx) => {
    const epics = await ctx.db.query("epics").collect();
    const patched: string[] = [];
    for (const epic of epics) {
      if (epic.lastReconciledAt === undefined) continue;
      await ctx.db.patch(epic._id, { lastReconciledAt: undefined });
      patched.push(epic.id);
    }
    return { patched, scanned: epics.length };
  },
});
