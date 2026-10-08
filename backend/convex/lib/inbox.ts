// inbox.ts: ep-0 "Inbox", where an issue goes when no epic fits. It is created by the
// first issues.create that asks for it and never minted from the counter, so ep-0 is the
// one epic id that is not a number anybody handed out (docs/design.md §12). `openEpicArg`
// is here rather than in lookup.ts because it calls `ensureInbox`, and lookup.ts importing
// this file while this file imports `findEpic` would be a cycle. The id itself is declared
// in validators.ts, beside `epicTypeOf`, which reads it, and is re-exported here.
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./actor";
import { invalid, notFound } from "./errors";
import { insertEpic } from "./lifecycle";
import { findEpic } from "./lookup";
import { INBOX_ID } from "./validators";

export { INBOX_ID };

/**
 * The inbox epic, created on first use by `actor`, whose create it is. The inbox never
 * closes, so it is a stream.
 */
export async function ensureInbox(ctx: MutationCtx, actor: Actor): Promise<Doc<"epics">> {
  const existing = await findEpic(ctx, INBOX_ID);
  if (existing) return existing;

  return await insertEpic(ctx, actor, { id: INBOX_ID, title: "Inbox", type: "stream" });
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
