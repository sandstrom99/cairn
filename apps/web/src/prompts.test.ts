import { type Referable, ref } from "@cairn/cli/ref";
import { DAY, HOUR, ago, blocker, epic, issue, now } from "@cairn/cli/testing";
import type { ReviewView, ShownEpic } from "@cairn/cli/views";
import { describe, expect, it } from "vitest";
import {
  AT_MOST,
  type Prompt,
  blockerPrompts,
  epicPrompts,
  issuePrompts,
  sentence,
} from "./prompts.ts";

const keys = (prompts: Prompt[]): string[] => prompts.map((p) => p.key);
const said = (prompts: Prompt[], key: string): string =>
  sentence(prompts.find((p) => p.key === key)!);

/** A review of `of` with every list empty but the ones given. */
const review = (of: ShownEpic, over: Partial<ReviewView> = {}): ReviewView =>
  ({
    epic: of,
    canClose: false,
    near: [],
    inbox: [],
    nudges: [],
    silent: [],
    unverified: [],
    edges: [],
    ...over,
  }) as ReviewView;

const bl4 = { id: "bl-4", title: "name the day" };
const bl5 = { id: "bl-5", title: "pick the host" };

const issues = {
  "an open issue": issue(),
  stuck: issue({ stuck: true, lastActivity: ago(4 * DAY) }),
  waiting: issue({ waitingOn: [bl4] }),
  "waiting on two": issue({ waitingOn: [bl4, bl5] }),
  "blocked by a live issue": issue({ blockedBy: [{ id: "cn-2", title: "t", status: "open" }] }),
  "blocked by a closed issue": issue({
    blockedBy: [{ id: "cn-2", title: "t", status: "closed" }],
  }),
  deferred: issue({ deferUntil: now + DAY }),
  "in progress, 20 days old": issue({ status: "in_progress", createdAt: ago(20 * DAY) }),
  "open, 20 days old": issue({ createdAt: ago(20 * DAY) }),
  "stuck, waiting and 20 days old": issue({
    stuck: true,
    lastActivity: ago(4 * DAY),
    waitingOn: [bl4],
    createdAt: ago(20 * DAY),
  }),
  closed: issue({ status: "closed", closedAt: ago(HOUR) }),
  dropped: issue({ status: "dropped", closedAt: ago(HOUR), droppedReason: "no" }),
};

const open = epic();
const epics = {
  "an open epic": [open, undefined],
  stuck: [epic({ health: { moving: [], stuck: [issue()], waiting: [] } }), undefined],
  waiting: [
    epic({ health: { moving: [], stuck: [], waiting: [{ ...bl4, owner: "harbor" }] } }),
    undefined,
  ],
  messy: [
    open,
    review(open, { near: [{ a: { id: "cn-6", title: "t" }, b: { id: "cn-7", title: "t." } }] }),
  ],
  "reviewed and tidy": [open, review(open)],
  closed: [epic({ status: "closed" }), undefined],
} as const satisfies Record<string, readonly [ShownEpic, ReviewView | undefined]>;

describe("an issue's lines", () => {
  it.each([
    ["an open issue", ["explain", "catch-up", "pick-up"]],
    ["stuck", ["explain", "catch-up", "quiet", "pick-up"]],
    ["waiting", ["explain", "catch-up", "waiting"]],
    ["waiting on two", ["explain", "catch-up", "waiting"]],
    ["blocked by a live issue", ["explain", "catch-up"]],
    ["blocked by a closed issue", ["explain", "catch-up", "pick-up"]],
    ["deferred", ["explain", "catch-up"]],
    ["in progress, 20 days old", ["explain", "catch-up", "worth"]],
    ["open, 20 days old", ["explain", "catch-up", "worth", "pick-up"]],
    ["closed", ["explain", "catch-up", "walk-through"]],
    ["dropped", ["explain", "catch-up"]],
    ["stuck, waiting and 20 days old", ["explain", "catch-up", "quiet", "waiting"]],
  ] as const)("%s: %j", (state, expected) => {
    expect(keys(issuePrompts(issues[state], now))).toEqual(expected);
  });

  it("asks for the issue in plain terms, the same sentence in every state", () => {
    for (const shown of Object.values(issues))
      expect(said(issuePrompts(shown, now), "explain")).toBe(
        `Explain ${ref(shown)} in plain terms: what it's about and why it matters.`,
      );
  });

  it("counts the days an issue has been quiet", () => {
    expect(said(issuePrompts(issues.stuck, now), "quiet")).toContain("quiet for 4 days");
  });

  it("names what it waits on in the reference form, the English way", () => {
    expect(said(issuePrompts(issues.waiting, now), "waiting")).toContain(ref(bl4));
    expect(said(issuePrompts(issues["waiting on two"], now), "waiting")).toContain(
      `${ref(bl4)} and ${ref(bl5)}`,
    );
  });
});

describe("an epic's lines", () => {
  it.each([
    ["an open epic", ["where", "next"]],
    ["stuck", ["where", "stuck", "next"]],
    ["waiting", ["where", "stuck", "next"]],
    ["messy", ["where", "messy", "next"]],
    ["reviewed and tidy", ["where", "next"]],
    ["closed", ["where"]],
  ] as const)("%s: %j", (state, expected) => {
    const [shown, reviewed] = epics[state];
    expect(keys(epicPrompts(shown, reviewed))).toEqual(expected);
  });
});

describe("a blocker's lines", () => {
  it("offers help deciding while it is unresolved, and nothing after", () => {
    expect(keys(blockerPrompts(blocker()))).toEqual(["decide"]);
    expect(
      keys(
        blockerPrompts(blocker({ status: "resolved", resolvedAt: ago(HOUR), resolution: "done" })),
      ),
    ).toEqual([]);
  });
});

describe("every line", () => {
  const cases: [Referable, Prompt[]][] = [
    ...Object.values(issues).map((i): [Referable, Prompt[]] => [i, issuePrompts(i, now)]),
    ...Object.values(epics).map(([e, r]): [Referable, Prompt[]] => [e, epicPrompts(e, r)]),
    [blocker(), blockerPrompts(blocker())],
  ];

  it("names the page's own item in the reference form, at most AT_MOST of them", () => {
    for (const [item, prompts] of cases) {
      expect(prompts.length).toBeLessThanOrEqual(AT_MOST);
      for (const p of prompts) expect(sentence(p)).toContain(ref(item));
    }
  });

  it("is something to say, never a command to run", () => {
    for (const [, prompts] of cases)
      for (const p of prompts) expect(sentence(p)).not.toMatch(/\/cairn:|\bcn [a-z]/);
  });
});
