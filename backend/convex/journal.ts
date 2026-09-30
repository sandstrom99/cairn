// journal.ts: what actually happened, entry by entry. An append is an insert and nothing
// ever updates one, which is why it cannot lose an entry the way a rewritten notes field
// does (docs/design.md §3).
//
// It takes no `revision` and bumps none: a finding recorded while another actor edits the
// issue is not a conflict, so it always lands. It does stamp `lastActivity`, which is how
// a claim heartbeats for free, and any status is fine — evidence arrives after a close.
import { v } from "convex/values";
import { actorValidator } from "./lib/actor";
import { invalid } from "./lib/errors";
import { record } from "./lib/events";
import { mutation } from "./lib/guard";
import { issueById } from "./lib/lookup";
import { journalKindValidator } from "./lib/validators";

export const append = mutation({
  args: {
    actor: actorValidator,
    id: v.string(),
    kind: journalKindValidator,
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const issue = await issueById(ctx, args.id);
    if (args.body.trim() === "") throw invalid("a journal entry needs a body");

    const _id = await ctx.db.insert("journal", {
      issueId: issue._id,
      author: args.actor,
      kind: args.kind,
      body: args.body,
    });
    // A direct patch, not applyRevision: the revision belongs to the mutable fields, and
    // an append moves none of them.
    await ctx.db.patch(issue._id, { lastActivity: Date.now() });
    await record(ctx, {
      kind: "journal.append",
      actor: args.actor,
      issueId: issue._id,
      // The whole body: `record` keeps its first line, the way every text in an event travels.
      changes: { kind: args.kind, body: args.body },
    });

    const entry = (await ctx.db.get(_id))!;
    return {
      id: issue.id,
      kind: entry.kind,
      body: entry.body,
      author: entry.author,
      at: entry._creationTime,
    };
  },
});
