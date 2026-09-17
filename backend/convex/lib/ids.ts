// ids.ts: the public ids, minted server-side inside the creating mutation and never
// reused. One `counters` row per key: a project slug for issues, "ep" for epics, "bl"
// for blockers. Minting starts at 1; ep-0 is never minted, it is the inbox.
import type { MutationCtx } from "../_generated/server";

/** The next number for `key`, creating the counter on first use. */
export async function mint(ctx: MutationCtx, key: string): Promise<number> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row) {
    await ctx.db.insert("counters", { key, next: 2 });
    return 1;
  }
  await ctx.db.patch(row._id, { next: row.next + 1 });
  return row.next;
}
