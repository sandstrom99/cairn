// search.ts: one query, what the list already holds about a text. A title and each link's
// URL and label hold it as one substring, case aside, read from the issue rows, so the
// page's jump bar agrees on a title. Descriptions and journal bodies go through text
// indexes, since scanning them read every description and the whole journal on each call:
// an index finds a row by any word of the text, the last as a prefix, and `holdsAll` then
// requires every word, so neither field answers for a text it holds only in part.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { issuesWhere } from "./lib/graph";
import { query } from "./lib/guard";
import { SEARCH_HITS, SEARCH_TERMS } from "./lib/limits";
import { projectBySlug } from "./lib/lookup";
import { priorityOrder } from "./lib/order";
import { issueStatusValidator } from "./lib/validators";
import { issueView, lookups } from "./lib/views";

/** The field a hit was found in: the first of the four that holds the text. */
type Matched = "title" | "description" | "links" | "journal";

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
    const words = needle.split(/\s+/);
    // Convex splits on punctuation itself; cutting to its term limit keeps the query valid.
    const terms = (needle.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, SEARCH_TERMS).join(" ");
    const has = (s: string | undefined) => s !== undefined && s.toLowerCase().includes(needle);
    // The index answers for any one word, so each word is held to a word's start here too:
    // without it `etry loop` would find "a retry loop" through `loop` alone.
    const startsWord = (text: string, w: string) => {
      for (let i = text.indexOf(w); i !== -1; i = text.indexOf(w, i + 1))
        if (i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1])) return true;
      return false;
    };
    const holdsAll = (s: string | undefined) => {
      const folded = s?.toLowerCase();
      return folded !== undefined && words.every((w) => startsWord(folded, w));
    };

    const project = args.project === undefined ? null : await projectBySlug(ctx, args.project);
    const rows = await issuesWhere(ctx, { project, epic: null, status: args.status });

    const described = new Set<Id<"issues">>();
    if (terms !== "" && rows.some((doc) => !has(doc.title))) {
      const texts = await ctx.db
        .query("issueText")
        .withSearchIndex("search_description", (q) => q.search("description", terms))
        .take(SEARCH_HITS);
      for (const row of texts) if (holdsAll(row.description)) described.add(row.issueId);
    }

    const hits: { doc: Doc<"issues">; matched: Matched }[] = [];
    const rest: Doc<"issues">[] = [];
    for (const doc of rows) {
      if (has(doc.title)) hits.push({ doc, matched: "title" });
      // The row's own description answers for an issue whose text has not moved yet.
      else if (described.has(doc._id) || holdsAll(doc.description))
        hits.push({ doc, matched: "description" });
      else if (doc.links?.some((l) => has(l.url) || has(l.label)))
        hits.push({ doc, matched: "links" });
      else rest.push(doc);
    }

    // The journal is searched once, and only when some issue is still unanswered.
    if (rest.length > 0 && terms !== "") {
      const entries = await ctx.db
        .query("journal")
        .withSearchIndex("search_body", (q) => q.search("body", terms))
        .take(SEARCH_HITS);
      const inJournal = new Set<Id<"issues">>(
        entries.filter((e) => holdsAll(e.body)).map((e) => e.issueId),
      );
      for (const doc of rest) if (inJournal.has(doc._id)) hits.push({ doc, matched: "journal" });
    }

    hits.sort((a, b) => priorityOrder(a.doc, b.doc));
    const seen = lookups();
    return await Promise.all(
      hits.map(async ({ doc, matched }) => ({ ...(await issueView(ctx, doc, seen)), matched })),
    );
  },
});
