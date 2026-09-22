// inbox.ts: ep-0 "Inbox", where an issue goes when no epic fits. It is created by the
// first issues.create that asks for it and never minted from the counter, so ep-0 is the
// one epic id that is not a number anybody handed out (docs/design.md §12). `openEpicArg`
// is here rather than in lookup.ts because it calls `ensureInbox`, and lookup.ts importing
// this file while this file imports `findEpic` would be a cycle.
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./actor";
import { createdChanges } from "./changes";
import { invalid, notFound } from "./errors";
import { record } from "./events";
import { findEpic } from "./lookup";
import { epicView } from "./views";

export const INBOX_ID = "ep-0";

/** The inbox epic, created on first use by `actor`, whose create it is. */
export async function ensureInbox(ctx: MutationCtx, actor: Actor): Promise<Doc<"epics">> {
  const existing = await findEpic(ctx, INBOX_ID);
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
    // Inserted this instant, so nothing points at it yet and it has no issues to read.
    changes: createdChanges(epicView(doc, [])),
  });
  return doc;
}

/**
 * The epic a create or update names, as the open epic it is. `ep-0` is made on first
 * use; any other id must exist and be open, since an issue goes in an open epic.
 */
export async function openEpicArg(
  ctx: MutationCtx,
  actor: Actor,
  id: string,
): Promise<Doc<"epics">> {
  const epic = id === INBOX_ID ? await ensureInbox(ctx, actor) : await findEpic(ctx, id);
  if (!epic) throw notFound(id);
  if (epic.status !== "open")
    throw invalid(`epic ${epic.id} is ${epic.status}; an issue goes in an open epic`);
  return epic;
}
