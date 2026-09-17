// inbox.ts: ep-0 "Inbox", where an issue goes when no epic fits. It is created by the
// first issues.create that asks for it and never minted from the counter, so ep-0 is the
// one epic id that is not a number anybody handed out (docs/design.md §12).
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./actor";
import { record } from "./events";
import { createdChanges, epicView } from "./views";

export const INBOX_ID = "ep-0";

/** The inbox epic, created on first use by `actor`, whose create it is. */
export async function ensureInbox(ctx: MutationCtx, actor: Actor): Promise<Doc<"epics">> {
  const existing = await ctx.db
    .query("epics")
    .withIndex("by_public_id", (q) => q.eq("id", INBOX_ID))
    .unique();
  if (existing) return existing;

  const _id = await ctx.db.insert("epics", {
    id: INBOX_ID,
    title: "Inbox",
    status: "open",
    revision: 0,
  });
  const doc = (await ctx.db.get(_id))!;
  await record(ctx, {
    kind: "epic.create",
    actor,
    epicId: _id,
    changes: createdChanges(await epicView(ctx, doc)),
  });
  return doc;
}
