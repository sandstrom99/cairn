// search.ts: one query, what the list already holds about a text. The scan is the design:
// one substring rule, case aside, over title, description and every journal body, so the
// three fields match the same way and the page's jump bar agrees. A Convex search index
// comes when a measured deployment makes this slow, not before.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { issuesWhere } from "./lib/graph";
import { query } from "./lib/guard";
import { projectBySlug } from "./lib/lookup";
import { priorityOrder } from "./lib/order";
import { issueStatusValidator } from "./lib/validators";
import { issueView } from "./lib/views";

/** The field a hit was found in: the first of the three that holds the text. */
type Matched = "title" | "description" | "journal";

export const find = query({
  args: {
    text: v.string(),
    project: v.optional(v.string()),
    status: v.optional(issueStatusValidator),
  },
  handler: async (ctx, args) => {
    const needle = args.text.trim().toLowerCase();
    // The CLI refuses an empty text before it gets here; an empty needle would match
    // everything, so the query answers nothing rather than the whole deployment.
    if (needle === "") return [];
    const has = (s: string | undefined) => s !== undefined && s.toLowerCase().includes(needle);

    const project = args.project === undefined ? null : await projectBySlug(ctx, args.project);
    const rows = await issuesWhere(ctx, { project, epic: null, status: args.status });

    const hits: { doc: Doc<"issues">; matched: Matched }[] = [];
    const rest: Doc<"issues">[] = [];
    for (const doc of rows) {
      if (has(doc.title)) hits.push({ doc, matched: "title" });
      else if (has(doc.description)) hits.push({ doc, matched: "description" });
      else rest.push(doc);
    }

    // The journal is read once, and only when some issue is still unanswered: most
    // searches that hit a title never pay for every entry in the deployment.
    if (rest.length > 0) {
      const entries = await ctx.db.query("journal").collect();
      const inJournal = new Set<Id<"issues">>(
        entries.filter((e) => has(e.body)).map((e) => e.issueId),
      );
      for (const doc of rest) if (inJournal.has(doc._id)) hits.push({ doc, matched: "journal" });
    }

    hits.sort((a, b) => priorityOrder(a.doc, b.doc));
    return await Promise.all(
      hits.map(async ({ doc, matched }) => ({ ...(await issueView(ctx, doc)), matched })),
    );
  },
});
