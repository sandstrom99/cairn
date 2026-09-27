// lifecycle.ts: one helper per lifecycle move of docs/design.md §5 and §6, each owning its
// patch, what its event records and its kind, so the two drop sites (issues.ts, epics.ts)
// cannot drift from each other, and no second site of any other move can drift from the
// first. Every issue and epic insert is here too, with its `*.create` event.
//
// What an event records is what a reader should see, not the patch that was written.
// `lastActivity`, `claimedAt` and `closedAt` are housekeeping the row's own time already
// says, so they are patched and never recorded, and an actor travels by name. Each helper
// declares its `changes` beside its patch, and `applyRevision` records exactly that. Events
// written before 2026-09-20 keep their raw maps: nothing migrates an audit trail.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./actor";
import { invalid } from "./errors";
import { record } from "./events";
import { issuesHeldBy } from "./graph";
import { mint } from "./ids";
import { type Link, type LinkInput, addLinks, linkRecord, removeLinks } from "./links";
import { checkPriority } from "./priority";
import { applyRevision } from "./revision";
import type { FollowUpKind, IssueType } from "./validators";
import type { VerificationInput } from "./verification";
import { type IssueView, epicView, issueView } from "./views";

/** The public fields of a just-created document, for an event's `changes`. */
export function createdChanges<T extends { createdAt: number }>(view: T): Omit<T, "createdAt"> {
  const copy: Record<string, unknown> = { ...view };
  delete copy.createdAt;
  return copy as Omit<T, "createdAt">;
}

/** One line for the event; the whole record, output included, stays on the issue. */
function verificationSummary(proof: VerificationInput): string {
  if ("exitCode" in proof) return `${proof.command} (exit ${proof.exitCode})`;
  return `unverified: ${proof.unverified}`;
}

/** What a new issue is made of. The id is minted here, and the row starts open at revision 0. */
type NewIssue = {
  project: Doc<"projects">;
  epicId: Id<"epics">;
  title: string;
  description?: string;
  design?: string;
  acceptance?: string;
  type: IssueType;
  followUpKind?: FollowUpKind;
  parentIssueId?: Id<"issues">;
  requires: string[];
  links: Link[];
  priority: number;
};

/**
 * Mints `<slug>-<n>`, inserts the row, records `issue.create`, returns the view. The epic
 * is not checked for being open: a follow-up lands beside its parent in whatever epic that
 * is, since residue outlives a close (§5). The open-epic rule is `openEpicArg`'s, for the
 * epic an argument names.
 */
export async function insertIssue(
  ctx: MutationCtx,
  actor: Actor,
  fields: NewIssue,
): Promise<IssueView> {
  const n = await mint(ctx, fields.project.slug);
  const _id = await ctx.db.insert("issues", {
    id: `${fields.project.slug}-${n}`,
    projectId: fields.project._id,
    epicId: fields.epicId,
    title: fields.title,
    ...(fields.description === undefined ? {} : { description: fields.description }),
    ...(fields.design === undefined ? {} : { design: fields.design }),
    ...(fields.acceptance === undefined ? {} : { acceptance: fields.acceptance }),
    type: fields.type,
    ...(fields.followUpKind === undefined ? {} : { followUpKind: fields.followUpKind }),
    ...(fields.parentIssueId === undefined ? {} : { parentIssueId: fields.parentIssueId }),
    requires: fields.requires,
    ...(fields.links.length === 0 ? {} : { links: fields.links }),
    status: "open",
    priority: checkPriority(fields.priority),
    lastActivity: Date.now(),
    revision: 0,
  });
  const view = await issueView(ctx, (await ctx.db.get(_id))!);
  await record(ctx, {
    kind: "issue.create",
    actor,
    issueId: _id,
    epicId: fields.epicId,
    revision: 0,
    changes: createdChanges(view),
  });
  return view;
}

/**
 * Inserts an epic open at revision 0 and records `epic.create`. The inbox passes `ep-0`;
 * everything else a minted id.
 */
export async function insertEpic(
  ctx: MutationCtx,
  actor: Actor,
  fields: { id: string; title: string; description?: string },
): Promise<Doc<"epics">> {
  const _id = await ctx.db.insert("epics", {
    id: fields.id,
    title: fields.title,
    ...(fields.description === undefined ? {} : { description: fields.description }),
    status: "open",
    revision: 0,
  });
  const doc = (await ctx.db.get(_id))!;
  await record(ctx, {
    kind: "epic.create",
    actor,
    epicId: _id,
    revision: 0,
    // Inserted this instant, so nothing points at it yet and it has no issues to read.
    changes: createdChanges(epicView(doc, [])),
  });
  return doc;
}

/** Claims an open issue for `actor`, recording the status and the claimer's name. */
export async function claimIssue(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"issues">,
): Promise<Doc<"issues">> {
  const now = Date.now();
  return await applyRevision(
    ctx,
    { table: "issues", doc },
    { status: "in_progress", claimedBy: actor, claimedAt: now, lastActivity: now },
    {
      kind: "issue.claim",
      actor,
      changes: { status: { from: doc.status, to: "in_progress" }, claimedBy: { to: actor.name } },
    },
  );
}

/** Hands a claimed issue back to open, recording who held it when somebody did. */
export async function releaseIssue(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"issues">,
): Promise<Doc<"issues">> {
  const changes: Record<string, { from?: unknown; to?: unknown }> = {
    status: { from: doc.status, to: "open" },
  };
  if (doc.claimedBy !== undefined) changes.claimedBy = { from: doc.claimedBy.name };
  return await applyRevision(
    ctx,
    { table: "issues", doc },
    { status: "open", claimedBy: undefined, claimedAt: undefined, lastActivity: Date.now() },
    { kind: "issue.release", actor, changes },
  );
}

// Close and drop deliberately do not record `claimedBy` going away: ending an issue ends
// its claim, and the claim event already named who held it.

/** Closes an issue with its verification record, recording the one-line summary of it. */
export async function closeIssue(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"issues">,
  proof: VerificationInput,
): Promise<Doc<"issues">> {
  const now = Date.now();
  return await applyRevision(
    ctx,
    { table: "issues", doc },
    {
      status: "closed",
      closedAt: now,
      verification: { ...proof, at: now, by: actor },
      claimedBy: undefined,
      claimedAt: undefined,
      lastActivity: now,
    },
    {
      kind: "issue.close",
      actor,
      changes: {
        status: { from: doc.status, to: "closed" },
        verification: { to: verificationSummary(proof) },
      },
    },
  );
}

/** Drops an issue with its reason, recording the status and the reason. */
export async function dropIssue(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"issues">,
  reason: string,
): Promise<Doc<"issues">> {
  const now = Date.now();
  return await applyRevision(
    ctx,
    { table: "issues", doc },
    {
      status: "dropped",
      droppedReason: reason,
      closedAt: now,
      claimedBy: undefined,
      claimedAt: undefined,
      lastActivity: now,
    },
    {
      kind: "issue.drop",
      actor,
      changes: { status: { from: doc.status, to: "dropped" }, droppedReason: { to: reason } },
    },
  );
}

/**
 * What `cn update` can change. `deferUntil: null` clears the date; absent leaves it.
 * `epic` is the resolved open epic. `link` adds or relabels and `unlink` takes off, by URL.
 */
export type IssueEdit = {
  title?: string;
  description?: string;
  design?: string;
  acceptance?: string;
  priority?: number;
  requires?: string[];
  deferUntil?: number | null;
  epic?: Doc<"epics">;
  link?: LinkInput[];
  unlink?: string[];
};

/**
 * The one `issue.update`: patches every field given, records each as `{ from, to }` and
 * stamps `lastActivity`. Refuses an empty edit. A link edit that changes nothing is not
 * one: the issue comes back as it was, with no revision and no event, so attaching a URL
 * it already carries is harmless.
 */
export async function editIssue(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"issues">,
  edit: IssueEdit,
): Promise<Doc<"issues">> {
  const patch: Partial<Doc<"issues">> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const set = <
    K extends "title" | "description" | "design" | "acceptance" | "priority" | "requires",
  >(
    field: K,
    to: Doc<"issues">[K],
  ) => {
    changes[field] = { from: doc[field], to };
    patch[field] = to;
  };
  if (edit.title !== undefined) set("title", edit.title);
  if (edit.description !== undefined) set("description", edit.description);
  if (edit.design !== undefined) set("design", edit.design);
  if (edit.acceptance !== undefined) set("acceptance", edit.acceptance);
  if (edit.priority !== undefined) set("priority", checkPriority(edit.priority));
  if (edit.requires !== undefined) set("requires", edit.requires);
  if (edit.deferUntil !== undefined) {
    // null clears the field; the change is recorded as null so the history reads as
    // "to nothing" rather than dropping the key.
    patch.deferUntil = edit.deferUntil ?? undefined;
    changes.deferUntil = { from: doc.deferUntil ?? null, to: edit.deferUntil };
  }
  if (edit.epic !== undefined) {
    const was = await ctx.db.get(doc.epicId);
    patch.epicId = edit.epic._id;
    // Recorded as the two public ids: nothing outside the deployment knows a Convex id.
    changes.epic = { from: was?.id, to: edit.epic.id };
  }
  if (edit.link !== undefined || edit.unlink !== undefined) {
    const link = edit.link ?? [];
    const unlink = edit.unlink ?? [];
    for (const url of unlink)
      if (link.some((l) => l.url.trim() === url.trim()))
        throw invalid(`${url.trim()} is both linked and unlinked`);
    const was = doc.links ?? [];
    const next = addLinks(removeLinks(was, unlink, doc.id), link, { by: actor, at: Date.now() });
    if (JSON.stringify(linkRecord(was)) !== JSON.stringify(linkRecord(next))) {
      // undefined takes the field off, so an issue with no links carries no empty array.
      patch.links = next.length > 0 ? next : undefined;
      changes.links = { from: linkRecord(was), to: linkRecord(next) };
    } else if (Object.keys(patch).length === 0) return doc;
  }
  if (Object.keys(patch).length === 0) throw invalid("nothing to update");

  // lastActivity is stamped by every write and is noise in a history line, so the
  // recorded changes are what the caller asked for and not the housekeeping beside it.
  patch.lastActivity = Date.now();
  return await applyRevision(ctx, { table: "issues", doc }, patch, {
    kind: "issue.update",
    actor,
    changes,
  });
}

/** Reparenting alone, the edit `issues.update --epic` makes when nothing else changes. */
export const moveIssue = (
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"issues">,
  epic: Doc<"epics">,
): Promise<Doc<"issues">> => editIssue(ctx, actor, doc, { epic });

/** Closes an epic, recording the status. Whether it may close is the caller's to decide. */
export async function closeEpic(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"epics">,
): Promise<Doc<"epics">> {
  return await applyRevision(
    ctx,
    { table: "epics", doc },
    { status: "closed" },
    { kind: "epic.close", actor, changes: { status: { from: doc.status, to: "closed" } } },
  );
}

/** Drops an epic with its reason, recording both. Its issues are the caller's to drop first. */
export async function dropEpic(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"epics">,
  reason: string,
): Promise<Doc<"epics">> {
  return await applyRevision(
    ctx,
    { table: "epics", doc },
    { status: "dropped", droppedReason: reason },
    {
      kind: "epic.drop",
      actor,
      changes: { status: { from: doc.status, to: "dropped" }, droppedReason: { to: reason } },
    },
  );
}

/** A person has seen the blocker: raised moves to waiting. */
export async function ackBlocker(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"blockers">,
): Promise<Doc<"blockers">> {
  return await applyRevision(
    ctx,
    { table: "blockers", doc },
    { status: "waiting" },
    { kind: "blocker.ack", actor, changes: { status: { from: doc.status, to: "waiting" } } },
  );
}

/** Resolves a blocker with its note, and records on every issue it held what freed it. */
export async function resolveBlocker(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"blockers">,
  note: string,
): Promise<Doc<"blockers">> {
  const resolved = await applyRevision(
    ctx,
    { table: "blockers", doc },
    { status: "resolved", resolvedBy: actor, resolvedAt: Date.now(), resolution: note },
    {
      kind: "blocker.resolve",
      actor,
      // The patch as a map would print the timestamp and the whole actor object; the two
      // fields a reader wants are what it moved to and what was said.
      changes: { status: { from: doc.status, to: "resolved" }, resolution: { to: note } },
    },
  );

  // One event per issue it held, so `cn show <issue> --history` says what freed it.
  for (const issue of await issuesHeldBy(ctx, doc._id))
    await record(ctx, {
      kind: "blocker.resolve",
      actor,
      issueId: issue._id,
      changes: { blocker: doc.id, title: doc.title, resolution: note },
    });
  return resolved;
}
