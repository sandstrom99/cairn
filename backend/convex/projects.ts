// projects.ts: the id prefixes. A project is a namespace for issue ids and a name to
// print, nothing more — `cn` resolves which project a session is in, not the deployment
// (docs/design.md §13). `list` reads each one's health the way an epic's is read, and
// its pulse (§8). `ep` and `bl` are reserved: epics and blockers mint from the same
// counters mechanism and would collide.
import { v } from "convex/values";
import { actorValidator } from "./lib/actor";
import { nowArg } from "./lib/clock";
import { conflict, invalid } from "./lib/errors";
import { record } from "./lib/events";
import { issuesWhere } from "./lib/graph";
import { mutation, query } from "./lib/guard";
import { issueHealth, pulses } from "./lib/health";
import { findProject } from "./lib/lookup";
import { PULSE_DAYS } from "./lib/thresholds";
import { countsOf } from "./lib/views";

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
  args: { ...nowArg },
  handler: async (ctx, { now }) => {
    const at = now ?? Date.now();
    const rows = await ctx.db.query("projects").withIndex("by_slug").collect();
    const filed = await Promise.all(
      rows.map((project) => issuesWhere(ctx, { project, epic: null })),
    );
    const pulse = await pulses(ctx, filed.flat(), at);
    return Promise.all(
      rows.map(async (project, i) => {
        const issues = filed[i]!;
        return {
          slug: project.slug,
          name: project.name,
          filed: issues.length,
          counts: countsOf(issues),
          health: await issueHealth(ctx, issues, at),
          pulse:
            pulse.get(project._id) ??
            Array.from({ length: PULSE_DAYS }, () => ({ events: 0, closes: 0 })),
        };
      }),
    );
  },
});
