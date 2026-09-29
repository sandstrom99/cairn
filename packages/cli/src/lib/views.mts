// views.mts: the shapes the lines and the page read. Four are the deployment's own return
// types, `Shown`, `ReviewView`, `LogEvent` and `BriefView`, because an answer that big is
// not worth restating, and a field that moves in the schema then moves here at `vp check`
// rather than at runtime. The rest are structural: the least a line needs, so one list
// line prints from a create's answer, a claim's and a show's alike, and a test builds a
// view without the whole answer.

import type { api } from "@cairn/backend/convex/_generated/api.js";
import type { FunctionReturnType } from "convex/server";
import type { Referable } from "./ref.mts";

/** What `cn show <id>` answers: an issue, an epic or a blocker. */
export type Shown = FunctionReturnType<typeof api.show.get>;
export type ShownIssue = Extract<Shown, { kind: "issue" }>;
export type ShownEpic = Extract<Shown, { kind: "epic" }>;
export type ShownBlocker = Extract<Shown, { kind: "blocker" }>;

/** What a close stored (design §12). */
export type Verification = NonNullable<ShownIssue["verification"]>;

/** What `cn review` answers. */
export type ReviewView = FunctionReturnType<typeof api.review.get>;

/** What `cn log` lists: one event, with whatever it names resolved to id and title. */
export type LogEvent = FunctionReturnType<typeof api.events.recent>[number];

/** What `cn brief` answers: the counts and the heads of design §8. */
export type BriefView = FunctionReturnType<typeof api.brief.get>;

/** Where this session is, for the brief's first line. */
export type BriefWhere = { deployment: string; actor: string };

/** Enough of an issue to print one line of a list. */
export type IssueLineView = Referable & {
  status: string;
  priority: number;
  epic?: Referable;
  claimedBy?: { name: string };
  revision?: number;
};

/** A list row under `--silent` or `--blocked`: the issue line, plus its silence or what holds it. */
export type ListLineView = IssueLineView & { silentSince?: number; blockedBy?: Referable[] };

/** A search hit: the issue line, plus which of title, description, links or journal held it. */
export type SearchLineView = IssueLineView & {
  matched: "title" | "description" | "links" | "journal";
};

/** One edge, as `edges.add` and `edges.remove` both answer. */
export type EdgeView = { type: string; from: Referable; to: Referable };

/** One `events` row, as the stale error and `cn show --history` both carry it. */
export type HistoryEvent = {
  at: number;
  actor: { name: string };
  kind: string;
  revision?: number;
  changes?: unknown;
};

/** Enough of a blocker to print one line of `cn waiting`. */
export type BlockerLineView = Referable & {
  blockerKind: string;
  owner: string;
  status: string;
  raisedAt: number;
  raisedBy: { name: string };
  resolvedAt?: number;
  resolvedBy?: { name: string };
};

/** Enough of an epic to print its health block: the counts, and the three lines of §8. */
export type EpicLineView = Referable & {
  /** The epic's own, which the overview prints under its head line the way `cn show` does. */
  description?: string;
  /** The newest write to the epic or to any issue under it, as the issues stamp it; the overview sorts by it. */
  lastActivity: number;
  counts: { open: number; inProgress: number; closed: number; followUps: number };
  health: {
    moving: (Referable & { claimedBy: { name: string }; claimedAt: number })[];
    stuck: (Referable & { lastActivity: number })[];
    waiting: (Referable & { owner: string })[];
  };
};

/** One journal entry, as `cn show` carries the five newest. */
export type JournalEntry = { at: number; author: { name: string }; kind: string; body: string };

/**
 * What `cn close` answers: the issue, the follow-up where one was made, the epic's offer,
 * and the open issues the close was the last thing holding.
 */
export type ClosedView = {
  issue: IssueLineView;
  followUp?: IssueLineView;
  epicDone?: Referable & { revision: number };
  madeReady: IssueLineView[];
};

/** What `cn epic close` answers: the epic as it now stands, and what a drop took with it. */
export type EpicClosedView = {
  epic: Referable & { status: string; revision: number; counts: { followUps: number } };
  dropped: Referable[];
};
