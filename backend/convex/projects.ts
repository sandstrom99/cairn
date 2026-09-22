// projects.ts: the id prefixes. A project is a namespace for issue ids and a name to
// print, nothing more — `cn` resolves which project a session is in, not the deployment
// (docs/design.md §13). `ep` and `bl` are reserved: epics and blockers mint from the
// same counters mechanism and would collide.
import { v } from "convex/values";
import { actorValidator } from "./lib/actor";
import { conflict, invalid } from "./lib/errors";
import { record } from "./lib/events";
import { mutation, query } from "./lib/guard";
import { findProject } from "./lib/lookup";

const SLUG = /^[a-z][a-z0-9]{0,15}$/;
const RESERVED = ["ep", "bl"];

export const create = mutation({
  args: { actor: actorValidator, slug: v.string(), name: v.string() },
  handler: async (ctx, { actor, slug, name }) => {
    if (!SLUG.test(slug))
      throw invalid(
        `slug "${slug}" must be 1 to 16 lowercase letters and digits, starting a letter`,
      );
    if (RESERVED.includes(slug))
      throw invalid(`slug "${slug}" is reserved: ep is epics and bl is blockers`);
    const existing = await findProject(ctx, slug);
    if (existing) throw conflict(`project ${slug} already exists as "${existing.name}"`);

    await ctx.db.insert("projects", { slug, name });
    await record(ctx, { kind: "project.create", actor, changes: { slug, name } });
    return { slug, name };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("projects").withIndex("by_slug").collect();
    return rows.map(({ slug, name }) => ({ slug, name }));
  },
});
