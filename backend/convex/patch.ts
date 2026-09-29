// patch.ts: one-offs that change stored rows, run by hand against each deployment.
//
//   npx convex run patch:dropRequires            from backend/, against the local deployment
//
// `issues.requires` went with the rest of machine capabilities on 2026-09-29 (cn-116,
// docs/design.md §5), and cn-119 stopped writing and reading it. Every issue written
// before then still carries it, `[]` on most, and Convex refuses to push a schema that
// forbids a field over rows that have it. So the field stays declared, optional, until
// this has run against every deployment; then cn-120 deletes the field and this with it.
//
// It is an internal mutation, so no client can reach it: `convex run` with the
// deployment's own credentials is the only way in, and the secret guard has nothing to
// fence. It writes no event and bumps no revision, since nothing reads the field and so
// nothing anyone reads changes. Running it again finds nothing and changes nothing.
//
// One mutation reads every issue: a worklist is a few hundred rows, far inside what one
// transaction may read.
import { internalMutation } from "./_generated/server";

/** Unsets `requires` on every issue that carries it, and says how many did. */
export const dropRequires = internalMutation({
  args: {},
  handler: async (ctx) => {
    const issues = await ctx.db.query("issues").collect();
    let stripped = 0;
    for (const doc of issues) {
      if (doc.requires === undefined) continue;
      await ctx.db.patch(doc._id, { requires: undefined });
      stripped++;
    }
    return { issues: issues.length, stripped };
  },
});
