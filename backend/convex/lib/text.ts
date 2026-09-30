// text.ts: the one place the `issueText` table is read and written. An issue's long text,
// its description, design, acceptance and the proof's output, lives there, one row per
// issue, apart from the row every list reads (docs/design.md §3, "The three content
// fields"): Convex bills a read for the whole document, and every list used to pay for the
// text to print one line. `show.get` and `search.find` read it through `textOf`, the
// mutations that set it write it through `writeText`, and `issueText:move` carries the
// rows written before 2026-09-30 across through `moveText`.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { withoutOutput } from "./verification";

export type IssueText = {
  description?: string;
  design?: string;
  acceptance?: string;
  output?: string;
};

const rowOf = (ctx: QueryCtx, issueId: Id<"issues">) =>
  ctx.db
    .query("issueText")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .unique();

/** What the issue row itself still carries, from before its text moved out. */
function carried(doc: Doc<"issues">): IssueText {
  const proof = doc.verification;
  return {
    description: doc.description,
    design: doc.design,
    acceptance: doc.acceptance,
    output: proof !== undefined && "command" in proof ? proof.output : undefined,
  };
}

/**
 * An issue's text. The `issueText` row answers, and for a row `issueText:move` has not
 * reached yet each field falls back to what the issue row still carries, so a deployment
 * reads the same before the move as after it. An edit made since writes the table, which
 * is why the table wins field by field rather than row by row.
 */
export async function textOf(ctx: QueryCtx, doc: Doc<"issues">): Promise<IssueText> {
  const row = await rowOf(ctx, doc._id);
  const old = carried(doc);
  return {
    description: row?.description ?? old.description,
    design: row?.design ?? old.design,
    acceptance: row?.acceptance ?? old.acceptance,
    output: row?.output ?? old.output,
  };
}

/**
 * Sets the fields `patch` names on the issue's text row, making the row when there is none.
 * A key whose value is undefined is left as it is: an edit sets what it names.
 */
export async function writeText(
  ctx: MutationCtx,
  issueId: Id<"issues">,
  patch: Partial<IssueText>,
): Promise<void> {
  const set: IssueText = {};
  for (const key of ["description", "design", "acceptance", "output"] as const)
    if (patch[key] !== undefined) set[key] = patch[key];
  if (Object.keys(set).length === 0) return;
  const row = await rowOf(ctx, issueId);
  if (row === null) await ctx.db.insert("issueText", { issueId, ...set });
  else await ctx.db.patch(row._id, set);
}

/**
 * Moves what an issue row still carries into its text row and takes it off the issue,
 * returning whether there was anything to move. A field the text row already holds was
 * written by an edit since, so it wins and the row's older value is dropped, the answer
 * `textOf` gave before the move. Running it again on the same row moves nothing.
 */
export async function moveText(ctx: MutationCtx, doc: Doc<"issues">): Promise<boolean> {
  const old = carried(doc);
  if (Object.values(old).every((value) => value === undefined)) return false;

  const row = await rowOf(ctx, doc._id);
  await writeText(ctx, doc._id, {
    description: row?.description === undefined ? old.description : undefined,
    design: row?.design === undefined ? old.design : undefined,
    acceptance: row?.acceptance === undefined ? old.acceptance : undefined,
    output: row?.output === undefined ? old.output : undefined,
  });
  await ctx.db.patch(doc._id, {
    description: undefined,
    design: undefined,
    acceptance: undefined,
    ...(old.output === undefined || doc.verification === undefined
      ? {}
      : { verification: withoutOutput(doc.verification) }),
  });
  return true;
}
