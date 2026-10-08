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
import { type Link, type LinkInput, editLinks } from "./links";
import { checkPriority } from "./priority";
import { applyRevision } from "./revision";
import { type IssueText, textOf, writeText } from "./text";
import { type EpicType, type FollowUpKind, type IssueType, epicTypeOf } from "./validators";
import type { VerificationInput } from "./verification";
import { type IssueView, epicView, issueView } from "./views";

/**
 * The public fields of a just-created document, for an event's `changes`. `record` cuts
 * the text fields to their first line, so the whole description stays on the row.
 */
export function createdChanges<T extends { createdAt: number }>(view: T): Omit<T, "createdAt"> {
  const copy: Record<string, unknown> = { ...view };
  delete copy.createdAt;
  return copy as Omit<T, "createdAt">;
}

/** One line for the event; the whole record stays on the issue, its output in `issueText`. */
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
  links: Link[];
  priority: number;
};

/** A just-created issue: its view, and the text it was created with, which no list carries. */
export type CreatedIssue = IssueView & Pick<IssueText, "description" | "design" | "acceptance">;

/**
 * Mints `<slug>-<n>`, inserts the row and its text, records `issue.create`, returns the
 * view with the text beside it, so the event and the answer say what they said when the
 * text lived on the row. The epic is not checked for being open: a follow-up lands beside
 * its parent in whatever epic that is, since residue outlives a close (§5). The open-epic
 * rule is `openEpicArg`'s, for the epic an argument names.
 */
export async function insertIssue(
  ctx: MutationCtx,
  actor: Actor,
  fields: NewIssue,
): Promise<CreatedIssue> {
  const n = await mint(ctx, fields.project.slug);
  const _id = await ctx.db.insert("issues", {
    id: `${fields.project.slug}-${n}`,
    projectId: fields.project._id,
    epicId: fields.epicId,
    title: fields.title,
    type: fields.type,
    ...(fields.followUpKind === undefined ? {} : { followUpKind: fields.followUpKind }),
    ...(fields.parentIssueId === undefined ? {} : { parentIssueId: fields.parentIssueId }),
    ...(fields.links.length === 0 ? {} : { links: fields.links }),
    status: "open",
    priority: checkPriority(fields.priority),
    lastActivity: Date.now(),
    revision: 0,
  });
  const text = {
    ...(fields.description === undefined ? {} : { description: fields.description }),
    ...(fields.design === undefined ? {} : { design: fields.design }),
    ...(fields.acceptance === undefined ? {} : { acceptance: fields.acceptance }),
  };
  await writeText(ctx, _id, text);
  const created: CreatedIssue = { ...(await issueView(ctx, (await ctx.db.get(_id))!)), ...text };
  await record(ctx, {
    kind: "issue.create",
    actor,
    issueId: _id,
    epicId: fields.epicId,
    revision: 0,
    changes: createdChanges(created),
  });
  return created;
}

/**
 * Inserts an epic open at revision 0 and records `epic.create`. The inbox passes `ep-0`;
 * everything else a minted id.
 */
export async function insertEpic(
  ctx: MutationCtx,
  actor: Actor,
  fields: {
    id: string;
    title: string;
    type: EpicType;
    doneWhen?: string;
    description?: string;
    links?: Link[];
  },
): Promise<Doc<"epics">> {
  const _id = await ctx.db.insert("epics", {
    id: fields.id,
    title: fields.title,
    type: fields.type,
    ...(fields.doneWhen === undefined ? {} : { doneWhen: fields.doneWhen }),
    ...(fields.description === undefined ? {} : { description: fields.description }),
    ...(fields.links === undefined || fields.links.length === 0 ? {} : { links: fields.links }),
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

/**
 * Closes an issue with its verification record, recording the one-line summary of it. The
 * row keeps the record without the command's output, which goes to `issueText`.
 */
export async function closeIssue(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"issues">,
  proof: VerificationInput,
): Promise<Doc<"issues">> {
  const now = Date.now();
  const stamp = { at: now, by: actor };
  if ("exitCode" in proof) await writeText(ctx, doc._id, { output: proof.output });
  return await applyRevision(
    ctx,
    { table: "issues", doc },
    {
      status: "closed",
      closedAt: now,
      verification:
        "exitCode" in proof
          ? { command: proof.command, exitCode: proof.exitCode, ...stamp }
          : { unverified: proof.unverified, ...stamp },
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
  deferUntil?: number | null;
  epic?: Doc<"epics">;
  link?: LinkInput[];
  unlink?: string[];
};

/**
 * The one `issue.update`: patches every field given, records each as `{ from, to }` and
 * stamps `lastActivity`. Refuses an empty edit. A link edit that changes nothing is not
 * one: the issue comes back as it was, with no revision and no event, so attaching a URL
 * it already carries is harmless. The three text fields are written to `issueText`, and
 * their `from` read from it, once and only when one is set; the row still takes the
 * revision and the stamp, so an edit to the text is an edit to the issue.
 */
export async function editIssue(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"issues">,
  edit: IssueEdit,
): Promise<Doc<"issues">> {
  const patch: Partial<Doc<"issues">> = {};
  const text: Partial<IssueText> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const set = <K extends "title" | "priority">(field: K, to: Doc<"issues">[K]) => {
    changes[field] = { from: doc[field], to };
    patch[field] = to;
  };
  const was: IssueText =
    edit.description !== undefined || edit.design !== undefined || edit.acceptance !== undefined
      ? await textOf(ctx, doc)
      : {};
  const setText = (field: "description" | "design" | "acceptance", to: string) => {
    changes[field] = { from: was[field], to };
    text[field] = to;
  };
  if (edit.title !== undefined) set("title", edit.title);
  if (edit.description !== undefined) setText("description", edit.description);
  if (edit.design !== undefined) setText("design", edit.design);
  if (edit.acceptance !== undefined) setText("acceptance", edit.acceptance);
  if (edit.priority !== undefined) set("priority", checkPriority(edit.priority));
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
    const links = editLinks(doc.links, edit, doc.id, { by: actor, at: Date.now() });
    if (links !== undefined) {
      patch.links = links.next;
      changes.links = links.change;
    } else if (Object.keys(changes).length === 0) return doc;
  }
  if (Object.keys(changes).length === 0) throw invalid("nothing to update");

  await writeText(ctx, doc._id, text);
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

/** Each issue a close carried into another epic, by id: `tools-113: ep-7 → ep-13`. */
export type Carried = Record<string, { from: string; to: string }>;

/**
 * Closes an epic, recording the status. Whether it may close is the caller's to decide. A
 * carry names each moved issue by id as a field, `tools-113: ep-7 → ep-13`, which the log
 * renders like any field.
 */
export async function closeEpic(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"epics">,
  carried: Carried = {},
): Promise<Doc<"epics">> {
  return await applyRevision(
    ctx,
    { table: "epics", doc },
    { status: "closed" },
    {
      kind: "epic.close",
      actor,
      changes: { status: { from: doc.status, to: "closed" }, ...carried },
    },
  );
}

/**
 * The epic a close carried work into. Its issue set changed, so its revision moves and a
 * writer holding the old one is told what came in; the patch is empty on purpose.
 */
export async function noteCarriedInto(
  ctx: MutationCtx,
  actor: Actor,
  target: Doc<"epics">,
  carried: Carried,
): Promise<Doc<"epics">> {
  return await applyRevision(
    ctx,
    { table: "epics", doc: target },
    {},
    { kind: "epic.update", actor, changes: carried },
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

/** What `cn update ep-N` can change. `link` adds or relabels and `unlink` takes off, by URL. */
export type EpicEdit = {
  title?: string;
  description?: string;
  doneWhen?: string;
  type?: EpicType;
  link?: LinkInput[];
  unlink?: string[];
};

/**
 * The one `epic.update`, shaped like `editIssue`: patches every field given and records
 * each as `{ from, to }`. An epic has no `lastActivity`, so nothing is stamped beside the
 * patch. Refuses an empty edit and a title with nothing in it; a link edit that changes
 * nothing hands the epic back as it was, with no revision and no event. Turning an epic
 * into a stream takes its done-when off, since a stream has none; whether a type and a
 * done-when go together is `epics.update`'s to decide.
 */
export async function editEpic(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"epics">,
  edit: EpicEdit,
): Promise<Doc<"epics">> {
  const patch: Partial<Doc<"epics">> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (edit.title !== undefined) {
    if (edit.title.trim() === "") throw invalid("an epic needs a title");
    changes.title = { from: doc.title, to: edit.title };
    patch.title = edit.title;
  }
  if (edit.description !== undefined) {
    changes.description = { from: doc.description, to: edit.description };
    patch.description = edit.description;
  }
  if (edit.doneWhen !== undefined) {
    changes.doneWhen = { from: doc.doneWhen, to: edit.doneWhen };
    patch.doneWhen = edit.doneWhen;
  }
  if (edit.type !== undefined) {
    changes.type = { from: epicTypeOf(doc), to: edit.type };
    patch.type = edit.type;
    if (edit.type === "stream" && doc.doneWhen !== undefined) {
      changes.doneWhen = { from: doc.doneWhen, to: undefined };
      // A patch with `undefined` removes the field from the row.
      patch.doneWhen = undefined;
    }
  }
  if (edit.link !== undefined || edit.unlink !== undefined) {
    const links = editLinks(doc.links, edit, doc.id, { by: actor, at: Date.now() });
    if (links !== undefined) {
      patch.links = links.next;
      changes.links = links.change;
    } else if (Object.keys(patch).length === 0) return doc;
  }
  if (Object.keys(patch).length === 0) throw invalid("nothing to update");
  return await applyRevision(ctx, { table: "epics", doc }, patch, {
    kind: "epic.update",
    actor,
    changes,
  });
}

/** What `cn project update` can change. The slug is not here: every issue id carries it. */
export type ProjectEdit = {
  name?: string;
  description?: string;
  link?: LinkInput[];
  unlink?: string[];
};

/**
 * The one `project.update`, shaped like `editEpic`: patches every field given and records
 * each as `{ from, to }`. A project has no `lastActivity`, so nothing is stamped beside the
 * patch. Refuses an empty edit and a name with nothing in it; a link edit that changes
 * nothing hands the project back as it was, with no revision and no event.
 */
export async function editProject(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"projects">,
  edit: ProjectEdit,
): Promise<Doc<"projects">> {
  const patch: Partial<Doc<"projects">> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (edit.name !== undefined) {
    if (edit.name.trim() === "") throw invalid("a project needs a name");
    changes.name = { from: doc.name, to: edit.name };
    patch.name = edit.name;
  }
  if (edit.description !== undefined) {
    changes.description = { from: doc.description, to: edit.description };
    patch.description = edit.description;
  }
  if (edit.link !== undefined || edit.unlink !== undefined) {
    const links = editLinks(doc.links, edit, doc.slug, { by: actor, at: Date.now() });
    if (links !== undefined) {
      patch.links = links.next;
      changes.links = links.change;
    } else if (Object.keys(patch).length === 0) return doc;
  }
  if (Object.keys(patch).length === 0) throw invalid("nothing to update");
  return await applyRevision(ctx, { table: "projects", doc }, patch, {
    kind: "project.update",
    actor,
    changes,
  });
}

/**
 * A blocker has been seen, by the person or by an agent on their word: raised moves to
 * waiting, and the event keeps the words when there are any.
 */
export async function ackBlocker(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"blockers">,
  said?: string,
): Promise<Doc<"blockers">> {
  return await applyRevision(
    ctx,
    { table: "blockers", doc },
    { status: "waiting" },
    {
      kind: "blocker.ack",
      actor,
      changes: {
        status: { from: doc.status, to: "waiting" },
        ...(said === undefined ? {} : { said: { to: said } }),
      },
    },
  );
}

/**
 * Resolves a blocker with its note, and the person's words when an agent resolves on them,
 * and records on every issue it held what freed it, the words included.
 */
export async function resolveBlocker(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"blockers">,
  note: string,
  said?: string,
): Promise<Doc<"blockers">> {
  const resolved = await applyRevision(
    ctx,
    { table: "blockers", doc },
    {
      status: "resolved",
      resolvedBy: actor,
      resolvedAt: Date.now(),
      resolution: note,
      ...(said === undefined ? {} : { said }),
    },
    {
      kind: "blocker.resolve",
      actor,
      // The patch as a map would print the timestamp and the whole actor object; the
      // fields a reader wants are what it moved to, what was decided and the words it rests on.
      changes: {
        status: { from: doc.status, to: "resolved" },
        resolution: { to: note },
        ...(said === undefined ? {} : { said: { to: said } }),
      },
    },
  );

  // One event per issue it held, so `cn show <issue> --history` says what freed it.
  for (const issue of await issuesHeldBy(ctx, doc._id))
    await record(ctx, {
      kind: "blocker.resolve",
      actor,
      issueId: issue._id,
      changes: {
        blocker: doc.id,
        title: doc.title,
        resolution: note,
        ...(said === undefined ? {} : { said }),
      },
    });
  return resolved;
}

/**
 * What `cn update bl-N` can change: its words and its links. Kind and owner stay as
 * raised. `link` adds or relabels and `unlink` takes off, by URL.
 */
export type BlockerEdit = {
  title?: string;
  whatResolves?: string;
  link?: LinkInput[];
  unlink?: string[];
};

/**
 * The one `blocker.update`, shaped like `editIssue`: patches every field given and records
 * each as `{ from, to }`, on the blocker alone and naming no issue (blockers.ts). Refuses an
 * empty edit, and a title or a resolves line with nothing in it, in the words a new blocker
 * is refused in; a link edit that changes nothing hands it back as it was.
 */
export async function editBlocker(
  ctx: MutationCtx,
  actor: Actor,
  doc: Doc<"blockers">,
  edit: BlockerEdit,
): Promise<Doc<"blockers">> {
  const patch: Partial<Doc<"blockers">> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (edit.title !== undefined) {
    if (edit.title.trim() === "") throw invalid("a blocker needs --title");
    changes.title = { from: doc.title, to: edit.title };
    patch.title = edit.title;
  }
  if (edit.whatResolves !== undefined) {
    if (edit.whatResolves.trim() === "") throw invalid("a blocker needs --resolves");
    changes.whatResolves = { from: doc.whatResolves, to: edit.whatResolves };
    patch.whatResolves = edit.whatResolves;
  }
  if (edit.link !== undefined || edit.unlink !== undefined) {
    const links = editLinks(doc.links, edit, doc.id, { by: actor, at: Date.now() });
    if (links !== undefined) {
      patch.links = links.next;
      changes.links = links.change;
    } else if (Object.keys(patch).length === 0) return doc;
  }
  if (Object.keys(patch).length === 0) throw invalid("nothing to update");
  return await applyRevision(ctx, { table: "blockers", doc }, patch, {
    kind: "blocker.update",
    actor,
    changes,
  });
}
