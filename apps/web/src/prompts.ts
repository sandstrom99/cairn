// prompts.ts: the ask menu's lines, which are things a person says to their agent about the
// thing on screen, in the person's own voice. Never a command: cairn runs behind the scenes,
// and the page never asks anyone to run or paste a `cn` line or a slash command. Which lines
// show is decided by the item's kind and state, from what the page already reads, in a
// fixed order and at most AT_MOST of them. The sentence keeps each reference as the thing
// it names, so the menu can show the id alone and the clipboard can get the reference form
// whole.
import { type Referable, ref } from "@cairn/cli/ref";
import { finished } from "@cairn/cli/parts";
import type { ReviewView, ShownBlocker, ShownEpic, ShownIssue } from "@cairn/cli/views";

/** One prompt: a stable key for tests, and the sentence in pieces, a reference kept as the thing it names. */
export type Prompt = { key: string; parts: (string | Referable)[] };

/** The sentence as it goes to the clipboard: every reference in the reference form. */
export const sentence = (p: Prompt): string =>
  p.parts.map((part) => (typeof part === "string" ? part : ref(part))).join("");

export const AT_MOST = 4;
const DAY = 24 * 60 * 60 * 1000;
/** An unfinished issue created longer ago than this is asked about. */
export const LONG_OPEN_MS = 14 * DAY;

const referable = ({ id, title }: Referable): Referable => ({ id, title });

/** Things listed the English way: `a`, `a and b`, `a, b and c`. */
function listed(items: Referable[]): (string | Referable)[] {
  return items.flatMap((item, i) => [
    ...(i === 0 ? [] : [i === items.length - 1 ? " and " : ", "]),
    referable(item),
  ]);
}

export function issuePrompts(issue: ShownIssue, now: number): Prompt[] {
  const r = referable(issue);
  const unfinished = issue.status === "open" || issue.status === "in_progress";
  const ready =
    issue.status === "open" &&
    issue.waitingOn.length === 0 &&
    issue.blockedBy.every((end) => finished(end) !== undefined) &&
    (issue.deferUntil === undefined || issue.deferUntil <= now);
  const days = Math.max(1, Math.floor((now - issue.lastActivity) / DAY));

  // First, because understanding an issue comes before every other question about it. On an
  // issue that is stuck, waiting and long open at once, the cap drops the last line.
  const prompts: (Prompt | false)[] = [
    {
      key: "explain",
      parts: [
        "Explain ",
        r,
        " in plain terms: what it's about and why it matters, in a few sentences.",
      ],
    },
    {
      key: "catch-up",
      parts: ["Catch me up on ", r, ": where it stands, what's been tried, what's left."],
    },
    issue.stuck && {
      key: "quiet",
      parts: [
        r,
        ` has been quiet for ${days} ${days === 1 ? "day" : "days"}. Find out why and tell me what it needs to move.`,
      ],
    },
    issue.waitingOn.length > 0 && {
      key: "waiting",
      parts: [
        r,
        " is waiting on ",
        ...listed(issue.waitingOn),
        ". What do you need from me, and what are my options?",
      ],
    },
    unfinished &&
      now - issue.createdAt >= LONG_OPEN_MS && {
        key: "worth",
        parts: ["Is ", r, " still worth doing? Make the case either way."],
      },
    ready && { key: "pick-up", parts: ["Pick up ", r, " and get it moving."] },
    issue.status === "closed" && {
      key: "walk-through",
      parts: ["Walk me through what ", r, " changed and how it was proven."],
    },
  ];
  return prompts.filter((p) => p !== false).slice(0, AT_MOST);
}

export function epicPrompts(epic: ShownEpic, review: ReviewView | undefined): Prompt[] {
  const r = referable(epic);
  const messy =
    review !== undefined &&
    [review.near, review.inbox, review.nudges, review.silent, review.unverified, review.edges].some(
      (list) => list.length > 0,
    );

  const prompts: (Prompt | false)[] = [
    { key: "where", parts: ["Where is ", r, "? What's done, what's moving, what's in the way."] },
    (epic.health.stuck !== undefined || epic.health.waiting.length > 0) && {
      key: "stuck",
      parts: ["Something in ", r, " is stuck. What's holding it, and what do you need from me?"],
    },
    messy && {
      key: "messy",
      parts: [
        r,
        " has gotten messy. Help me sort it out: duplicates, stragglers, what no longer belongs.",
      ],
    },
    epic.status === "open" && {
      key: "next",
      parts: ["What should happen next in ", r, ", and why that first?"],
    },
  ];
  return prompts.filter((p) => p !== false).slice(0, AT_MOST);
}

export function blockerPrompts(blocker: ShownBlocker): Prompt[] {
  const r = referable(blocker);
  const prompts: (Prompt | false)[] = [
    blocker.status !== "resolved" && {
      key: "decide",
      parts: ["Help me decide ", r, ": lay out the options and what each costs."],
    },
  ];
  return prompts.filter((p) => p !== false).slice(0, AT_MOST);
}
