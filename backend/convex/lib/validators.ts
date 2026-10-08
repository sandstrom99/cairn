// validators.ts: the literal unions of docs/design.md §3, declared once here so the schema
// and the functions cannot drift. schema.ts builds its tables from them and every function
// that takes one as an argument imports the same const, so a status or a kind added in one
// place is added everywhere. Beside them sit the one predicate over issue status that
// every lifecycle verb asks, the one over an epic's issues that says it is done, and the
// one that reads an epic's type. This file imports convex/values and nothing else, since
// the schema imports it, so the inbox's id lives here for that last one.
import { v, type Infer } from "convex/values";

/** ep-0 "Inbox", the one epic id never minted from the counter (lib/inbox.ts). */
export const INBOX_ID = "ep-0";

/** Where an epic is: still an outcome being worked, reached, or given up. */
export const epicStatusValidator = v.union(
  v.literal("open"),
  v.literal("closed"),
  v.literal("dropped"),
);

/** An outcome is reached and closes; a stream is an intake that never closes (§3). */
export const epicTypeValidator = v.union(v.literal("outcome"), v.literal("stream"));

/** One of `epicTypeValidator`'s literals. */
export type EpicType = Infer<typeof epicTypeValidator>;

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

/**
 * Every task finished and at least one was ever there: an epic that was worked and is done.
 * A follow-up is residue beside the epic and holds nothing back (§5, §7).
 */
export const epicFinished = (issues: { type: IssueType; status: IssueStatus }[]): boolean =>
  issues.some((i) => i.type === "task") && !issues.some((i) => i.type === "task" && isLive(i));

/**
 * An epic's type. A row from before the field reads by its id, since the inbox was always
 * the one epic that never closes.
 */
export const epicTypeOf = (doc: { id: string; type?: EpicType }): EpicType =>
  doc.type ?? (doc.id === INBOX_ID ? "stream" : "outcome");

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

/** What a journal entry records. */
export const journalKindValidator = v.union(
  v.literal("finding"),
  v.literal("decision"),
  v.literal("handoff"),
  v.literal("evidence"),
  v.literal("question"),
  v.literal("next"),
);

/** One of `journalKindValidator`'s literals. */
export type JournalKind = Infer<typeof journalKindValidator>;
