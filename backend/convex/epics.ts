// epics.ts: an epic is an outcome or a stream, never a place, so it belongs to no project
// and carries no epic-to-epic edges. An outcome says in its done-when what reaching it means
// and closes once it is reached; a stream is an intake that never closes. Its counts are
// computed from its issues on every read; there is no stored progress to go stale
// (docs/design.md §3, §5).
import { v } from "convex/values";
import { actorValidator } from "./lib/actor";
import { conflict, invalid } from "./lib/errors";
import { mutation, query } from "./lib/guard";
import { issuesIn } from "./lib/graph";
import { mint } from "./lib/ids";
import { INBOX_ID, openEpicArg } from "./lib/inbox";
import { nowArg } from "./lib/clock";
import { epicHealth } from "./lib/health";
import {
  type Carried,
  closeEpic,
  dropEpic,
  dropIssue,
  editEpic,
  insertEpic,
  moveIssue,
  noteCarriedInto,
} from "./lib/lifecycle";
import { addLinks, linkInputValidator } from "./lib/links";
import { epicById } from "./lib/lookup";
import { idOrder } from "./lib/order";
import { expectRevision } from "./lib/revision";
import { epicTypeOf, epicTypeValidator, isLive } from "./lib/validators";
import { epicView, ref } from "./lib/views";

const NEEDS_DONE_WHEN =
  "an outcome needs --done-when <when it is reached>; an intake that never closes is --stream";

/**
 * A new epic: an outcome with the sentence that says when it is reached, the default, or a
 * stream with none. Both are refused before anything is minted.
 */
export const create = mutation({
  args: {
    actor: actorValidator,
    title: v.string(),
    type: v.optional(epicTypeValidator),
    doneWhen: v.optional(v.string()),
    description: v.optional(v.string()),
    link: v.optional(v.array(linkInputValidator)),
  },
  handler: async (ctx, { actor, title, type = "outcome", doneWhen, description, link }) => {
    if (type === "outcome" && (doneWhen === undefined || doneWhen.trim() === ""))
      throw invalid(NEEDS_DONE_WHEN);
    if (type === "stream" && doneWhen !== undefined)
      throw invalid("a stream never closes, so it has no --done-when");
    const links = addLinks([], link ?? [], { by: actor, at: Date.now() });
    const n = await mint(ctx, "ep");
    const doc = await insertEpic(ctx, actor, {
      id: `ep-${n}`,
      title,
      type,
      doneWhen: doneWhen?.trim(),
      description,
      links,
    });
    return epicView(doc, []);
  },
});

export const list = query({
  args: { all: v.optional(v.boolean()), ...nowArg },
  handler: async (ctx, { all, now }) => {
    const rows = all
      ? await ctx.db.query("epics").collect()
      : await ctx.db
          .query("epics")
          .withIndex("by_status", (q) => q.eq("status", "open"))
          .collect();
    rows.sort(idOrder);
    return await Promise.all(
      rows.map(async (doc) => epicHealth(ctx, doc, await issuesIn(ctx, doc._id), now)),
    );
  },
});

/**
 * An epic's title, description, done-when, type and links, against the revision the writer
 * read, as `issues.update` edits an issue's. Only an open epic changes: a closed or dropped
 * one is history. ep-0 never does, since the inbox is where work lands when nothing says
 * where it belongs, and its name says so. A stream has no done-when, so an outcome turned
 * into one loses its line, and a stream becomes an outcome only with one.
 */
export const update = mutation({
  args: {
    actor: actorValidator,
    id: v.string(),
    revision: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    doneWhen: v.optional(v.string()),
    type: v.optional(epicTypeValidator),
    link: v.optional(v.array(linkInputValidator)),
    unlink: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const doc = await epicById(ctx, args.id);
    if (doc.id === INBOX_ID) throw invalid("ep-0 is the inbox; it does not change");
    await expectRevision(ctx, { table: "epics", doc }, args.revision);
    if (doc.status !== "open")
      throw invalid(`${doc.id} is ${doc.status}; nothing about it changes now`);

    const current = epicTypeOf(doc);
    const next = args.type ?? current;
    const blank = args.doneWhen === undefined || args.doneWhen.trim() === "";
    if (next === "stream" && args.doneWhen !== undefined)
      throw invalid(
        `a stream has no --done-when; --outcome --done-when makes ${doc.id} an outcome`,
      );
    if (next === "outcome" && current === "stream" && blank)
      throw invalid(`${doc.id} becomes an outcome with --done-when <when it is reached>`);
    if (args.doneWhen !== undefined && blank) throw invalid(NEEDS_DONE_WHEN);

    const edited = await editEpic(ctx, args.actor, doc, {
      title: args.title,
      description: args.description,
      doneWhen: args.doneWhen?.trim(),
      // An unchanged type is no change, so it records nothing and leaves an empty edit empty.
      type: next === current ? undefined : next,
      link: args.link,
      unlink: args.unlink,
    });
    return epicView(edited, await issuesIn(ctx, edited._id));
  },
});

/**
 * Closing an epic by hand, and dropping one with everything live in it.
 *
 * A close is refused on a stream, which never closes, and on an outcome while a task is
 * open, naming every one of them: an outcome with work left in it is not reached. Open
 * follow-ups do not refuse it — a follow-up is routed residue (§5), `cn ready` still lists
 * it, and the outcome it hangs off is done. The offer in `issues.close` counts tasks the
 * same way (§7).
 *
 * `--carry-to ep-M` closes an outcome reached with tasks left that belong next door: every
 * open and in-progress task moves into ep-M through `moveIssue`, its claim kept, and the
 * epic closes, all in this one mutation. Each move is its issue's `issue.update`, the
 * close names every issue it carried, and when any moved, ep-M's revision moves with an
 * `epic.update` naming them too. Follow-ups stay, as on any close. ep-M is an open epic,
 * not this one and not the inbox.
 *
 * `--drop --reason` is the other ending, for a stream as for an outcome: the epic is not
 * going to happen, so every live issue in it is dropped with that reason first, each
 * through `dropIssue` so each carries its own `issue.drop` event.
 */
export const close = mutation({
  args: {
    actor: actorValidator,
    id: v.string(),
    revision: v.number(),
    drop: v.optional(v.boolean()),
    reason: v.optional(v.string()),
    carryTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await epicById(ctx, args.id);
    if (doc.id === INBOX_ID) throw invalid("ep-0 is the inbox; it does not close");
    await expectRevision(ctx, { table: "epics", doc }, args.revision);
    if (doc.status !== "open") throw invalid(`${doc.id} is already ${doc.status}`);
    if (args.drop && args.carryTo !== undefined)
      throw invalid("--carry-to goes with a close, not --drop; a drop takes the work with it");

    const issues = await issuesIn(ctx, doc._id);
    const live = issues.filter(isLive);

    if (!args.drop) {
      if (epicTypeOf(doc) === "stream")
        throw invalid(`${doc.id} is a stream; it never closes, and --drop --reason retires it`);
      const liveTasks = live.filter((i) => i.type === "task");
      if (args.carryTo !== undefined) {
        if (args.carryTo === doc.id) throw invalid(`${doc.id} cannot carry its work to itself`);
        if (args.carryTo === INBOX_ID)
          throw invalid("ep-0 is the inbox; work is carried into an epic, not back to it");
        const target = await openEpicArg(ctx, args.actor, args.carryTo);
        liveTasks.sort(idOrder);
        const carried: Carried = {};
        for (const issue of liveTasks) {
          await moveIssue(ctx, args.actor, issue, target);
          carried[issue.id] = { from: doc.id, to: target.id };
        }
        const closed = await closeEpic(ctx, args.actor, doc, carried);
        if (liveTasks.length > 0) await noteCarriedInto(ctx, args.actor, target, carried);
        // The carried tasks left this epic, so the rows read above are stale: read them again.
        return {
          epic: await epicHealth(ctx, closed, await issuesIn(ctx, doc._id)),
          dropped: [],
          carried: liveTasks.map(ref),
          carriedTo: ref(target),
        };
      }
      if (liveTasks.length > 0)
        throw conflict(
          `${doc.id} "${doc.title}" has open work: ${liveTasks.map((i) => `${i.id} "${i.title}"`).join(", ")}; --carry-to <ep-id> moves it into another epic`,
        );
      const closed = await closeEpic(ctx, args.actor, doc);
      // Only the epic moved, so the issues read above are still the ones in it.
      return { epic: await epicHealth(ctx, closed, issues), dropped: [], carried: [] };
    }

    const reason = args.reason ?? "";
    if (reason.trim() === "") throw invalid("dropping an epic needs --reason");

    live.sort(idOrder);
    for (const issue of live) await dropIssue(ctx, args.actor, issue, reason);
    const dropped = await dropEpic(ctx, args.actor, doc, reason);
    // Every live issue was just dropped, so the rows read above are stale: read them again.
    return {
      epic: await epicHealth(ctx, dropped, await issuesIn(ctx, doc._id)),
      dropped: live.map(ref),
      carried: [],
    };
  },
});
