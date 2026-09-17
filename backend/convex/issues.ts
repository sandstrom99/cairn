// issues.ts: the node of the graph. Everything else is a field here or a row pointing at
// one (docs/design.md §3).
//
// `epicId` is required and there is no orphan state to represent, so a create with no
// epic does not fail vaguely: it throws `epic-required` carrying the open epics, and
// `cn create` prints them. ep-0 "Inbox" is the answer when none of them fits, and it is
// created by the first create that asks for it.
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { actorValidator } from "./lib/actor";
import { invalid, notFound } from "./lib/errors";
import { record } from "./lib/events";
import { mint } from "./lib/ids";
import { INBOX_ID, ensureInbox } from "./lib/inbox";
import { createdChanges, issueView, ref } from "./lib/views";

const statusValidator = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("closed"),
  v.literal("dropped"),
);

const DEFAULT_PRIORITY = 2;

export const create = mutation({
  args: {
    actor: actorValidator,
    project: v.string(),
    epic: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    design: v.optional(v.string()),
    acceptance: v.optional(v.string()),
    priority: v.optional(v.number()),
    type: v.optional(v.union(v.literal("task"), v.literal("follow-up"))),
    followUpKind: v.optional(
      v.union(v.literal("verify"), v.literal("decide"), v.literal("cleanup")),
    ),
    parent: v.optional(v.string()),
    requires: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.project))
      .unique();
    if (!project) throw notFound(args.project);

    if (args.epic === undefined) {
      const open = await ctx.db
        .query("epics")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .collect();
      open.sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));
      throw new ConvexError({
        kind: "epic-required",
        message: "an issue needs an epic",
        candidates: open.map(ref),
      });
    }
    const epic =
      args.epic === INBOX_ID
        ? await ensureInbox(ctx, args.actor)
        : await ctx.db
            .query("epics")
            .withIndex("by_public_id", (q) => q.eq("id", args.epic!))
            .unique();
    if (!epic) throw notFound(args.epic);
    if (epic.status !== "open")
      throw invalid(`epic ${epic.id} is ${epic.status}; an issue goes in an open epic`);

    const type = args.type ?? "task";
    if (type === "follow-up" && args.followUpKind === undefined)
      throw invalid("a follow-up needs a kind: verify, decide or cleanup");
    if (type === "task" && args.followUpKind !== undefined)
      throw invalid("only a follow-up has a kind");

    const parent =
      args.parent === undefined
        ? null
        : await ctx.db
            .query("issues")
            .withIndex("by_public_id", (q) => q.eq("id", args.parent!))
            .unique();
    if (args.parent !== undefined && !parent) throw notFound(args.parent);

    const priority = args.priority ?? DEFAULT_PRIORITY;
    if (!Number.isInteger(priority) || priority < 0 || priority > 4)
      throw invalid(`priority ${priority} is not an integer 0 to 4, 0 highest`);

    const n = await mint(ctx, project.slug);
    const _id = await ctx.db.insert("issues", {
      id: `${project.slug}-${n}`,
      projectId: project._id,
      epicId: epic._id,
      title: args.title,
      ...(args.description === undefined ? {} : { description: args.description }),
      ...(args.design === undefined ? {} : { design: args.design }),
      ...(args.acceptance === undefined ? {} : { acceptance: args.acceptance }),
      type,
      ...(args.followUpKind === undefined ? {} : { followUpKind: args.followUpKind }),
      ...(parent === null ? {} : { parentIssueId: parent._id }),
      requires: args.requires ?? [],
      status: "open",
      priority,
      lastActivity: Date.now(),
      revision: 0,
    });
    const view = await issueView(ctx, (await ctx.db.get(_id))!);
    await record(ctx, {
      kind: "issue.create",
      actor: args.actor,
      issueId: _id,
      epicId: epic._id,
      revision: 0,
      changes: createdChanges(view),
    });
    return view;
  },
});

export const list = query({
  args: {
    project: v.optional(v.string()),
    epic: v.optional(v.string()),
    status: v.optional(statusValidator),
    claimedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // One index does the work and the rest of the filters run in memory: a company's
    // worth of issues is a few hundred documents, two orders off Convex's 16,384 cap.
    const project =
      args.project === undefined
        ? null
        : await ctx.db
            .query("projects")
            .withIndex("by_slug", (q) => q.eq("slug", args.project!))
            .unique();
    if (args.project !== undefined && !project) throw notFound(args.project);
    const epic =
      args.epic === undefined
        ? null
        : await ctx.db
            .query("epics")
            .withIndex("by_public_id", (q) => q.eq("id", args.epic!))
            .unique();
    if (args.epic !== undefined && !epic) throw notFound(args.epic);

    let rows: Doc<"issues">[];
    if (epic) {
      rows = await ctx.db
        .query("issues")
        .withIndex("by_epic", (q) =>
          args.status === undefined
            ? q.eq("epicId", epic._id)
            : q.eq("epicId", epic._id).eq("status", args.status),
        )
        .collect();
    } else if (project) {
      rows = await ctx.db
        .query("issues")
        .withIndex("by_project", (q) =>
          args.status === undefined
            ? q.eq("projectId", project._id)
            : q.eq("projectId", project._id).eq("status", args.status),
        )
        .collect();
    } else if (args.status !== undefined) {
      rows = await ctx.db
        .query("issues")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      rows = await ctx.db.query("issues").collect();
    }

    if (project) rows = rows.filter((i) => i.projectId === project._id);
    if (args.status !== undefined) rows = rows.filter((i) => i.status === args.status);
    if (args.claimedBy !== undefined)
      rows = rows.filter((i) => i.claimedBy?.name === args.claimedBy);
    rows.sort((a, b) => a.priority - b.priority || a._creationTime - b._creationTime);
    return await Promise.all(rows.map((doc) => issueView(ctx, doc)));
  },
});
