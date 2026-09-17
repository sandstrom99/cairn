// format.mts: the lines cn prints. Every line naming an issue or epic starts with the
// reference form (ref.mts), so a list is readable a day later without looking anything
// up. The shapes come from the deployment's own return types, so a field that moves in
// the schema moves here at `vp check` rather than at runtime.

import type { api } from "@cairn/backend/convex/_generated/api.js";
import type { FunctionReturnType } from "convex/server";
import { type Referable, ref } from "./ref.mts";

/** What `cn show <id>` answers: an issue, an epic or a blocker. */
export type Shown = FunctionReturnType<typeof api.show.get>;

/** Enough of an issue to print one line of a list. */
export type IssueLineView = Referable & {
  status: string;
  priority: number;
  epic?: Referable;
  claimedBy?: { name: string };
  revision?: number;
};

/** One `events` row, as the stale error and `cn show --history` both carry it. */
export type HistoryEvent = {
  at: number;
  actor: { name: string };
  kind: string;
  revision?: number;
  changes?: unknown;
};

/** Enough of an epic to print one line of a list. */
export type EpicLineView = Referable & {
  counts: { open: number; inProgress: number; closed: number; followUps: number };
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago, in one token: `just now`, `5m`, `2h`, `3d`. */
export function age(sinceMs: number, now: number = Date.now()): string {
  const ms = Math.max(0, now - sinceMs);
  if (ms < MINUTE) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/**
 * `cn-1 "…" P0 open  ep-1 "…" · wsl/claude r3`
 *
 * The revision closes the line wherever the view carries one, so every list, create and
 * lifecycle line hands the agent the number its next write has to send. The issue rows
 * inside an epic's show do not carry it and print without.
 */
export function issueLine(view: IssueLineView): string {
  const parts = [`${ref(view)} P${view.priority} ${view.status}`];
  if (view.epic) parts.push(` ${ref(view.epic)}`);
  if (view.claimedBy) parts.push(`· ${view.claimedBy.name}`);
  if (view.revision !== undefined) parts.push(`r${view.revision}`);
  return parts.join(" ");
}

/** `ep-1 "…"  2 open · 1 in progress · 3 done · 1 follow-ups` */
export function epicLine(view: EpicLineView): string {
  const { open, inProgress, closed, followUps } = view.counts;
  return `${ref(view)}  ${open} open · ${inProgress} in progress · ${closed} done · ${followUps} follow-ups`;
}

/** The label column: the longest label is `blocked by`, and one space after it. */
const label = (name: string): string => name.padEnd(11);
const firstLine = (text: string): string => {
  const [head, ...rest] = text.split("\n");
  return rest.length > 0 && rest.join("").trim() !== "" ? `${head}…` : (head ?? "");
};
const refs = (items: Referable[]): string => items.map(ref).join(", ");
/** `2h ago`, but `just now` reads as itself. */
const since = (at: number, now: number): string => {
  const token = age(at, now);
  return token === "just now" ? token : `${token} ago`;
};

/** As much of one event's payload as belongs on a line. */
const CHANGES = 80;

const clip = (text: string): string =>
  text.length > CHANGES ? `${text.slice(0, CHANGES - 1)}…` : text;

/** A string prints as itself; anything else as its JSON, so `2 → 1` is not `"2" → "1"`. */
const side = (value: unknown): string =>
  value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value);

// `from` or `to`, not both: a value of undefined is not stored, so the first write of a
// field that had none comes back as `{ to }` alone.
const isFieldMap = (
  changes: unknown,
): changes is Record<string, { from?: unknown; to?: unknown }> =>
  typeof changes === "object" &&
  changes !== null &&
  !Array.isArray(changes) &&
  Object.values(changes).every(
    (v) => typeof v === "object" && v !== null && ("from" in v || "to" in v),
  );

/** `priority 2 → 1` for the field-map shape, the compact JSON for anything else. */
const changesOf = (changes: unknown): string => {
  if (changes === undefined) return "";
  if (isFieldMap(changes))
    return clip(
      Object.entries(changes)
        .map(([field, { from, to }]) => `${field} ${side(from)} → ${side(to)}`)
        .join(", "),
    );
  return clip(JSON.stringify(changes) ?? "");
};

/** `  r4  wsl/claude  2h ago  issue.update  priority 2 → 1` */
const eventLine = (e: HistoryEvent, now: number): string =>
  [
    "",
    e.revision === undefined ? "—" : `r${e.revision}`,
    e.actor.name,
    since(e.at, now),
    e.kind,
    changesOf(e.changes),
  ]
    .join("  ")
    .trimEnd();

/**
 * The events a rejected write came back with. A stale write is not a failure to report:
 * it is what changed, who changed it and when, so the agent re-reads and retries
 * (docs/design.md §9).
 */
export const staleLines = (data: { since?: HistoryEvent[] }, now: number = Date.now()): string[] =>
  (data.since ?? []).map((e) => eventLine(e, now));

/** The same lines, for `cn show <id> --history`. */
export const historyLines = (events: HistoryEvent[], now: number = Date.now()): string[] =>
  events.map((e) => eventLine(e, now));

/** The ten-line brief of `cn show`, one shape per kind. */
export function brief(shown: Shown, now: number = Date.now()): string {
  if (shown.kind === "epic") {
    const lines = [epicLine(shown)];
    if (shown.description) lines.push(shown.description);
    lines.push(...shown.issues.map((i) => `  ${issueLine(i)}`));
    return lines.join("\n");
  }
  if (shown.kind === "blocker") {
    return [
      ref(shown),
      `${label("kind")}${shown.blockerKind}`,
      `${label("owner")}${shown.owner}`,
      `${label("status")}${shown.status}`,
      ...(shown.issues.length > 0 ? [`${label("issues")}${refs(shown.issues)}`] : []),
    ].join("\n");
  }

  const lines = [
    ref(shown),
    `${label("epic")}${ref(shown.epic)}`,
    `${label("project")}${shown.project}`,
    `${label("status")}${shown.status} · P${shown.priority} · created ${since(shown.createdAt, now)} · revision ${shown.revision}`,
  ];
  if (shown.claimedBy)
    lines.push(
      `${label("claimed")}${shown.claimedBy.name}${
        shown.claimedAt === undefined ? "" : ` · ${age(shown.claimedAt, now)}`
      }`,
    );
  if (shown.requires.length > 0) lines.push(`${label("requires")}${shown.requires.join(", ")}`);
  if (shown.parent) lines.push(`${label("parent")}${ref(shown.parent)}`);
  if (shown.followUps.length > 0) lines.push(`${label("follow-ups")}${refs(shown.followUps)}`);
  if (shown.blocks.length > 0) lines.push(`${label("blocks")}${refs(shown.blocks)}`);
  if (shown.blockedBy.length > 0) lines.push(`${label("blocked by")}${refs(shown.blockedBy)}`);
  if (shown.waitingOn.length > 0) lines.push(`${label("waiting on")}${refs(shown.waitingOn)}`);
  if (shown.design) lines.push(`${label("design")}${firstLine(shown.design)}`);
  if (shown.acceptance) lines.push(`${label("acceptance")}${firstLine(shown.acceptance)}`);
  if (shown.journal.length > 0) {
    lines.push("journal");
    for (const e of shown.journal)
      lines.push(`  ${age(e.at, now)} ${e.author.name} ${e.kind}: ${e.body}`);
  }
  if (shown.events && shown.events.length > 0) {
    lines.push("history");
    lines.push(...historyLines(shown.events, now));
  }
  return lines.join("\n");
}
