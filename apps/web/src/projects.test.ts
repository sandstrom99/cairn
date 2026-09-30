// The Projects pages' own words and the chart's arithmetic: which word each project comes
// to and in what order they stand, every shape of the headline's clause, the lines under
// it, the scale the dots sit on and how they are nudged, and the legend's words held to
// the limits they describe.
import { STUCK_AFTER_MS } from "@cairn/backend/convex/lib/thresholds.js";
import { DAY, HOUR, agent, ago, now, project } from "@cairn/cli/testing";
import { describe, expect, it } from "vitest";
import {
  STUCK_RULE,
  clauseOf,
  clauseText,
  closedIn,
  countsLine,
  heldBy,
  markOf,
  orderProjects,
  placeDots,
  shown,
  stateLine,
  subline,
  tipOf,
  xOf,
} from "./projects.ts";
import type { Listed } from "./rows.tsx";
import { projectWord } from "./tone.tsx";

const moving = [{ id: "app-4", title: "the invite flow", claimedBy: agent, claimedAt: ago(HOUR) }];
const stuck = [
  { id: "app-2", title: "the settings page", lastActivity: ago(9 * DAY) },
  { id: "app-3", title: "the profile", lastActivity: ago(8 * DAY) },
];
const waiting = [{ id: "bl-1", title: "PostHog project settings", owner: "balder" }];
const counts = (open: number, inProgress = 0) => ({
  open,
  inProgress,
  closed: 0,
  dropped: 0,
  followUps: 0,
});

/** An issue as a list carries it: open, P2, in app under ep-1, an hour quiet. */
const listed = (over: Partial<Listed> = {}): Listed => ({
  id: "app-1",
  title: "the app",
  status: "open",
  priority: 2,
  claimedBy: undefined,
  epic: { id: "ep-1", title: "Ship invite links" },
  type: "task",
  project: "app",
  lastActivity: ago(HOUR),
  ...over,
});

describe("projectWord", () => {
  it("is waiting, stuck, moving, nothing filed or nothing moving", () => {
    expect(projectWord(project({ filed: 3, health: { moving, stuck, waiting } }))).toBe("waiting");
    expect(projectWord(project({ filed: 3, health: { moving, stuck, waiting: [] } }))).toBe(
      "stuck",
    );
    expect(projectWord(project({ filed: 3, health: { moving, stuck: [], waiting: [] } }))).toBe(
      "moving",
    );
    expect(projectWord(project())).toBe("nothing filed");
    expect(projectWord(project({ filed: 3 }))).toBe("nothing moving");
  });
});

describe("orderProjects", () => {
  it("puts the most pressing first, then the most live, then by slug", () => {
    const quiet = project({ slug: "zed", filed: 2, counts: counts(2) });
    const busier = project({ slug: "app", filed: 5, counts: counts(5) });
    const same = project({ slug: "bee", filed: 5, counts: counts(5) });
    const held = project({
      slug: "tools",
      filed: 1,
      counts: counts(1),
      health: { moving: [], stuck: [], waiting },
    });
    const none = project({ slug: "admin" });
    expect(orderProjects([none, quiet, same, busier, held]).map((p) => p.slug)).toEqual([
      "tools",
      "app",
      "bee",
      "zed",
      "admin",
    ]);
  });
});

describe("clauseOf", () => {
  const health = (m: typeof moving | [], s: typeof stuck | [], w: typeof waiting | []) => ({
    moving: m,
    stuck: s,
    waiting: w,
  });

  it("says the one thing to know of a project, in every shape", () => {
    expect(clauseText(clauseOf(project({ slug: "admin" })))).toBe("admin has nothing filed.");
    expect(
      clauseText(clauseOf(project({ filed: 2, health: health(moving, stuck, waiting) }))),
    ).toBe("app waits on you.");
    expect(clauseText(clauseOf(project({ filed: 2, health: health(moving, stuck, []) })))).toBe(
      "app is moving, with 2 stuck.",
    );
    expect(clauseText(clauseOf(project({ filed: 2, health: health(moving, [], []) })))).toBe(
      "app is moving.",
    );
    expect(clauseText(clauseOf(project({ filed: 2, health: health([], stuck, []) })))).toBe(
      "app has 2 stuck.",
    );
    expect(clauseText(clauseOf(project({ filed: 2 })))).toBe("app is quiet.");
  });

  it("marks the clauses with nothing behind them empty, and tints the state words", () => {
    expect(clauseOf(project()).empty).toBe(true);
    expect(clauseOf(project({ filed: 2 })).empty).toBe(true);
    const busy = clauseOf(project({ filed: 2, health: health(moving, stuck, []) }));
    expect(busy.empty).toBe(false);
    expect(busy.pieces.filter((p) => p.tone).map((p) => [p.text, p.tone])).toEqual([
      ["moving", "moving"],
      ["2 stuck", "stuck"],
    ]);
  });
});

describe("subline", () => {
  const pulse = (closes: number) =>
    Array.from({ length: 28 }, (_, k) => ({
      events: k === 27 ? closes : 0,
      closes: k === 27 ? closes : 0,
    }));

  it("counts what is live and what closed, singular and plural", () => {
    expect(subline([project({ filed: 1, counts: counts(1) })])).toBe(
      "1 live issue in 1 project · 0 closed in the last 4 weeks",
    );
    expect(
      subline([
        project({ filed: 3, counts: { ...counts(1, 1), followUps: 1 }, pulse: pulse(2) }),
        project({ slug: "admin", pulse: pulse(1) }),
      ]),
    ).toBe("3 live issues in 2 projects · 3 closed in the last 4 weeks");
  });
});

describe("stateLine", () => {
  const text = (p: Parameters<typeof stateLine>[0]) =>
    stateLine(p)
      .map((x) => x.text)
      .join("");

  it("says nothing is filed where nothing is", () => {
    expect(text(project())).toBe("Nothing filed yet.");
  });

  it("says each of the three, even at none, the first capitalised", () => {
    expect(
      text(project({ filed: 3, health: { moving: [], stuck: stuck.slice(0, 1), waiting: [] } })),
    ).toBe("Nothing moving, 1 stuck, nothing waiting on you.");
    const line = stateLine(project({ filed: 3, health: { moving, stuck: [], waiting } }));
    expect(line.map((x) => [x.text, x.tone])).toEqual([
      ["1 moving", "moving"],
      [", ", undefined],
      ["nothing stuck", "still"],
      [", ", undefined],
      ["1 waiting on you", "waiting"],
      [".", undefined],
    ]);
  });
});

describe("countsLine", () => {
  it("counts the live by status, the closes, and the epics they span", () => {
    const live = [
      listed(),
      listed({ id: "app-2", status: "in_progress" }),
      listed({ id: "app-3", epic: { id: "ep-2", title: "Scouts stop tripping" } }),
    ];
    expect(countsLine(live, [listed({ id: "app-5", status: "closed" })])).toBe(
      "2 open · 1 in progress · 1 closed in the last 4 weeks · across 2 epics",
    );
    expect(countsLine(live.slice(0, 1), [])).toBe(
      "1 open · 0 in progress · 0 closed in the last 4 weeks · across 1 epic",
    );
  });
});

describe("closedIn", () => {
  it("keeps the closes of the last four weeks, newest first, and only this project's", () => {
    const issues = [
      listed({ id: "app-1", status: "closed", closedAt: ago(29 * DAY) }),
      listed({ id: "app-2", status: "closed", closedAt: ago(27 * DAY) }),
      listed({ id: "app-3", status: "closed", closedAt: ago(DAY) }),
      listed({ id: "app-4", status: "dropped", closedAt: ago(DAY) }),
      listed({ id: "cn-1", project: "cn", status: "closed", closedAt: ago(DAY) }),
    ];
    expect(closedIn(issues, "app", now).map((i) => i.id)).toEqual(["app-3", "app-2"]);
  });
});

describe("the chart's scale", () => {
  it("is log, now at the left, three days at about the middle, 45 days and past at the right", () => {
    expect(xOf(0)).toBe(0);
    expect(Math.abs(xOf(3 * DAY) - 0.49)).toBeLessThan(0.02);
    expect(xOf(60 * DAY)).toBe(1);
  });

  it("says the limits the zones are drawn at", () => {
    expect(STUCK_AFTER_MS).toEqual({ 0: DAY, 1: 3 * DAY, 2: 7 * DAY });
    expect(STUCK_RULE).toBe("stuck past: P0 a day, P1 3 days, P2 a week; P3 and P4 never");
  });
});

describe("placeDots", () => {
  it("nudges a dot off its line where one before it sits there", () => {
    const issues = [listed({ id: "app-1" }), listed({ id: "app-2" })];
    const [a, b] = placeDots(issues, new Map(), now, 13, 8);
    expect(a!.x).toBe(b!.x);
    expect(a!.y).toBe(2 * 13 + 13 / 2);
    expect(b!.y).toBe(2 * 13 + 13 / 2 - Math.min(8 * 0.55, 13 * 0.3));
  });

  it("never nudges across priorities", () => {
    const [a, b] = placeDots(
      [listed({ id: "app-1", priority: 1 }), listed({ id: "app-2", priority: 3 })],
      new Map(),
      now,
      13,
      8,
    );
    expect(a!.y).toBe(13 + 13 / 2);
    expect(b!.y).toBe(3 * 13 + 13 / 2);
  });

  it("keeps a dot inside the plot and carries its mark", () => {
    const [a] = placeDots(
      [listed({ lastActivity: now })],
      new Map([["app-1", "moving"]]),
      now,
      13,
      8,
    );
    expect(a!.x).toBe(1);
    expect(a!.mark).toBe("moving");
  });
});

describe("markOf", () => {
  const p = project({ filed: 4, health: { moving: [], stuck: [stuck[0]!], waiting } });
  const held = heldBy([
    {
      id: "bl-1",
      title: "PostHog project settings",
      blockerKind: "decision",
      owner: "balder",
      status: "raised",
      raisedAt: ago(HOUR),
      raisedBy: agent,
      issues: [{ id: "app-9", title: "PostHog masks IPs" }],
    },
  ]);

  it("reads claimed as moving, held as waiting, named in health as stuck, and the rest open", () => {
    expect(markOf(listed({ status: "in_progress" }), p, held)).toBe("moving");
    expect(markOf(listed({ id: "app-9" }), p, held)).toBe("waiting");
    expect(markOf(listed({ id: "app-2" }), p, held)).toBe("stuck");
    expect(markOf(listed(), p, held)).toBe("open");
    expect(held.get("app-9")).toEqual({ id: "bl-1", title: "PostHog project settings" });
  });
});

describe("tipOf", () => {
  it("says the issue in the reference form, its priority and epic, and what it is", () => {
    const quiet = listed({ lastActivity: ago(3 * DAY) });
    expect(
      tipOf(listed({ status: "in_progress", claimedBy: agent }), "moving", undefined, now),
    ).toBe('app-1 "the app" · P2 · ep-1 · moving · wsl/claude 1h');
    expect(tipOf(quiet, "waiting", { id: "bl-1", title: "x" }, now)).toBe(
      'app-1 "the app" · P2 · ep-1 · waiting on bl-1 · silent 3d',
    );
    expect(tipOf(quiet, "stuck", undefined, now)).toBe(
      'app-1 "the app" · P2 · ep-1 · stuck · silent 3d',
    );
    expect(tipOf(quiet, "open", undefined, now)).toBe(
      'app-1 "the app" · P2 · ep-1 · open · silent 3d',
    );
  });
});

describe("shown", () => {
  it("drops the scheme and the trailing slash", () => {
    expect(shown("https://github.com/invyte-hq/invyte")).toBe("github.com/invyte-hq/invyte");
    expect(shown("https://invyte.dk/")).toBe("invyte.dk");
  });
});
