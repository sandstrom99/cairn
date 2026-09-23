// validators.ts: the literal unions of docs/design.md §3, declared once here so the schema
// and the functions cannot drift. schema.ts builds its tables from them and every function
// that takes one as an argument imports the same const, so a status or a kind added in one
// place is added everywhere. Beside them sit the one predicate over issue status that
// every lifecycle verb asks, and the one over an epic's issues that says it is done. This
// file imports convex/values and nothing else, since the schema imports it.
import { v, type Infer } from "convex/values";

/** Where an epic is: still an outcome being worked, reached, or given up. */
export const epicStatusValidator = v.union(
  v.literal("open"),
  v.literal("closed"),
  v.literal("dropped"),
);

/** One of `epicStatusValidator`'s literals. */
export type EpicStatus = Infer<typeof epicStatusValidator>;

/** A task is the work; a follow-up is the routed residue of closing one (§5). */
export const issueTypeValidator = v.union(v.literal("task"), v.literal("follow-up"));

/** One of `issueTypeValidator`'s literals. */
export type IssueType = Infer<typeof issueTypeValidator>;

/** What a follow-up is for. Only a follow-up carries one. */
export const followUpKindValidator = v.union(
  v.literal("verify"),
  v.literal("decide"),
  v.literal("cleanup"),
);

/** One of `followUpKindValidator`'s literals. */
export type FollowUpKind = Infer<typeof followUpKindValidator>;

/** Where an issue is in the lifecycle of §5. */
export const issueStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("closed"),
  v.literal("dropped"),
);

/** One of `issueStatusValidator`'s literals. */
export type IssueStatus = Infer<typeof issueStatusValidator>;

/** The two statuses that are still work. A closed or dropped issue blocks nothing (§4). */
export const isLive = (doc: { status: IssueStatus }): boolean =>
  doc.status === "open" || doc.status === "in_progress";

/** Every issue finished, follow-ups included, and at least one task was ever there: an epic that was worked and is done (§7). */
export const epicFinished = (issues: { type: IssueType; status: IssueStatus }[]): boolean =>
  issues.some((i) => i.type === "task") && !issues.some(isLive);

/** What an edge between two issues says. Only `blocks` touches readiness (§4). */
export const edgeTypeValidator = v.union(
  v.literal("blocks"),
  v.literal("related"),
  v.literal("discovered-from"),
  v.literal("duplicates"),
  v.literal("supersedes"),
);

/** One of `edgeTypeValidator`'s literals. */
export type EdgeType = Infer<typeof edgeTypeValidator>;

/** The five kinds of work no agent can do (§6). */
export const blockerKindValidator = v.union(
  v.literal("approval"),
  v.literal("external-wait"),
  v.literal("decision"),
  v.literal("credential"),
  v.literal("purchase"),
);

/** One of `blockerKindValidator`'s literals. */
export type BlockerKind = Infer<typeof blockerKindValidator>;

/** A blocker's lifecycle: raised, acknowledged by a person, resolved by one. */
export const blockerStatusValidator = v.union(
  v.literal("raised"),
  v.literal("waiting"),
  v.literal("resolved"),
);

/** One of `blockerStatusValidator`'s literals. */
export type BlockerStatus = Infer<typeof blockerStatusValidator>;

/** What a journal entry records. */
export const journalKindValidator = v.union(
  v.literal("finding"),
  v.literal("decision"),
  v.literal("handoff"),
  v.literal("evidence"),
  v.literal("question"),
);

/** One of `journalKindValidator`'s literals. */
export type JournalKind = Infer<typeof journalKindValidator>;
