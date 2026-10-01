// projects.ts: the id prefixes. A project is a namespace for issue ids, a name that is its
// one-line summary, and an optional description and links: a repository is a link, a URL
// cairn never reads. `cn` resolves which project a session is in, not the deployment
// (docs/design.md §13). The slug never changes, because the ids carry it; the name, the
// description and the links change against a revision (§3, §9). `list` reads each one's
// health the way an epic's is read, and its pulse (§8) only for a caller that sends
// `pulse: true`, `cn project list` and the page's Overview and Projects routes: the page's
// rail subscribes to the list on every screen and leaves the pulse out, so it reads no
// pulse rows. `ep` and `bl` are reserved: epics and blockers mint from the same counters
// mechanism and would collide.
import { v } from "convex/values";
import { actorValidator } from "./lib/actor";
import { nowArg } from "./lib/clock";
import { conflict, invalid } from "./lib/errors";
import { record } from "./lib/events";
import { issuesWhere } from "./lib/graph";
import { mutation, query } from "./lib/guard";
import { issueHealth } from "./lib/health";
import { editProject } from "./lib/lifecycle";
import { addLinks, linkInputValidator } from "./lib/links";
import { findProject, projectBySlug } from "./lib/lookup";
import { pulses } from "./lib/pulse";
import { expectRevision } from "./lib/revision";
import { countsOf, projectView } from "./lib/views";

const SLUG = /^[a-z][a-z0-9]{0,15}$/;
const RESERVED = ["ep", "bl"];

export const create = mutation({
  args: {
    actor: actorValidator,
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    link: v.optional(v.array(linkInputValidator)),
  },
  handler: async (ctx, { actor, slug, name, description, link }) => {
    if (!SLUG.test(slug))
      throw invalid(
        `slug "${slug}" must be 1 to 16 lowercase letters and digits, starting a letter`,
      );
    if (RESERVED.includes(slug))
      throw invalid(`slug "${slug}" is reserved: ep is epics and bl is blockers`);
    const existing = await findProject(ctx, slug);
    if (existing) throw conflict(`project ${slug} already exists as "${existing.name}"`);

    const links = addLinks([], link ?? [], { by: actor, at: Date.now() });
    const _id = await ctx.db.insert("projects", {
      slug,
      name,
      ...(description === undefined ? {} : { description }),
      ...(links.length === 0 ? {} : { links }),
      revision: 0,
    });
    await record(ctx, { kind: "project.create", actor, projectId: _id, changes: { slug, name } });
    return projectView((await ctx.db.get(_id))!);
  },
});

/**
 * A project's name, description and links, against the revision the writer read, as
 * `epics.update` edits an epic's. Nothing here changes a slug: every issue id carries it.
 */
export const update = mutation({
  args: {
    actor: actorValidator,
    slug: v.string(),
    revision: v.number(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    link: v.optional(v.array(linkInputValidator)),
    unlink: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const doc = await projectBySlug(ctx, args.slug);
    await expectRevision(ctx, { table: "projects", doc }, args.revision);
    const edited = await editProject(ctx, args.actor, doc, {
      name: args.name,
      description: args.description,
      link: args.link,
      unlink: args.unlink,
    });
    return projectView(edited);
  },
});

export const list = query({
  args: { ...nowArg, pulse: v.optional(v.boolean()) },
  handler: async (ctx, { now, pulse: withPulse }) => {
    const at = now ?? Date.now();
    const rows = await ctx.db.query("projects").withIndex("by_slug").collect();
    const filed = await Promise.all(
      rows.map((project) => issuesWhere(ctx, { project, epic: null })),
    );
    const pulse = withPulse
      ? await pulses(
          ctx,
          rows.map((p) => p._id),
          at,
        )
      : undefined;
    return Promise.all(
      rows.map(async (project, i) => {
        const issues = filed[i]!;
        return {
          ...projectView(project),
          filed: issues.length,
          counts: countsOf(issues),
          health: await issueHealth(ctx, issues, at),
          ...(pulse === undefined ? {} : { pulse: pulse.get(project._id)! }),
        };
      }),
    );
  },
});
