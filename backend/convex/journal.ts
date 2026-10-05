// journal.ts: what actually happened, entry by entry. An append is an insert and nothing
// ever updates one, which is why it cannot lose an entry the way a rewritten notes field
// does (docs/design.md §3).
//
// It takes no `revision` and bumps none: a finding recorded while another actor edits the
// issue is not a conflict, so it always lands. It does stamp `lastActivity`, which is how
// a claim heartbeats for free, and any status is fine — evidence arrives after a close.
// The one kind with a status is `next`, the direction a finished issue leaves, which a
// live issue refuses (lib/journal.ts).
import { v } from "convex/values";
import { actorValidator } from "./lib/actor";
import { mutation } from "./lib/guard";
import { appendEntry } from "./lib/journal";
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
    const entry = await appendEntry(ctx, args.actor, issue, args.kind, args.body);
    return {
      id: issue.id,
      kind: entry.kind,
      body: entry.body,
      author: entry.author,
      at: entry._creationTime,
    };
  },
});
