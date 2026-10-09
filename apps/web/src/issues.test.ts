// The Issues page's filter: what a query string reads as and what a filter writes back,
// which issues each field lets through and what each state's chip counts, and how the
// matched list is cut into pages with each group's whole count kept.
import { HOUR, ago } from "@cairn/cli/testing";
import { describe, expect, it } from "vitest";
import {
  DEFAULT,
  type Filter,
  LIVE,
  PAGE_SIZE,
  facets,
  hrefOf,
  isDefault,
  matched,
  narrow,
  pageLinks,
  pageOf,
  parseFilter,
  searchOf,
  toggleState,
  withFilter,
} from "./issues.ts";
import type { Listed } from "./rows.tsx";

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

const moving = listed({ id: "app-1", title: "Fix connection retry", status: "in_progress" });
const open = listed({ id: "app-2", title: "the invite flow", priority: 1 });
const followUp = listed({ id: "cn-3", type: "follow-up", project: "cn" });
const closed = listed({ id: "app-4", status: "closed", epic: { id: "ep-3", title: "Done" } });
const dropped = listed({ id: "app-5", status: "dropped" });
const second = listed({ id: "app-6", title: "the second open", priority: 0 });
const all = [moving, open, followUp, closed, dropped, second];

const ids = (issues: Listed[]) => issues.map((i) => i.id);

describe("parseFilter", () => {
  it("reads nothing as the default", () => {
    expect(parseFilter("")).toEqual(DEFAULT);
    expect(parseFilter("?")).toEqual(DEFAULT);
  });

  it("reads every key, with or without the leading ?", () => {
    expect(
      parseFilter("?status=closed,open&project=cn&epic=ep-3&priority=0&q=%20retry&page=2"),
    ).toEqual({
      states: ["open", "closed"],
      project: "cn",
      epic: "ep-3",
      priority: 0,
      q: "retry",
      page: 2,
    });
    expect(parseFilter("project=cn").project).toBe("cn");
  });

  it("drops what it cannot read and keeps the rest", () => {
    expect(parseFilter("status=closed,bogus").states).toEqual(["closed"]);
    expect(parseFilter("status=bogus").states).toEqual(LIVE);
    expect(parseFilter("status=none").states).toEqual([]);
    expect(parseFilter("priority=4")).toEqual({ ...DEFAULT, priority: 4 });
    expect(parseFilter("priority=5")).toEqual(DEFAULT);
    expect(parseFilter("page=0").page).toBe(1);
    expect(parseFilter("page=-2").page).toBe(1);
    expect(parseFilter("page=2x").page).toBe(1);
    expect(parseFilter("epic=app-3")).toEqual(DEFAULT);
    expect(parseFilter("project=Not_A_Slug")).toEqual(DEFAULT);
    expect(parseFilter("q=%20%20")).toEqual(DEFAULT);
  });

  it("keeps a trailing space, the one typed between two words", () => {
    expect(parseFilter("q=fix%20").q).toBe("fix ");
  });
});

describe("searchOf", () => {
  const full: Filter = {
    states: ["in_progress", "closed"],
    project: "cn",
    epic: "ep-3",
    priority: 1,
    q: "fix retry & more",
    page: 3,
  };

  it("writes nothing for the default", () => {
    expect(searchOf(DEFAULT)).toBe("");
    expect(isDefault(DEFAULT)).toBe(true);
    expect(isDefault({ ...DEFAULT, states: ["follow-up", "open", "in_progress"] })).toBe(true);
  });

  it("writes only what differs, in a fixed order", () => {
    expect(searchOf(full)).toBe(
      "?status=in_progress,closed&project=cn&epic=ep-3&priority=1&q=fix%20retry%20%26%20more&page=3",
    );
    expect(searchOf({ ...DEFAULT, states: [] })).toBe("?status=none");
    expect(searchOf({ ...DEFAULT, priority: 0 })).toBe("?priority=0");
    expect(hrefOf({ ...DEFAULT, page: 2 })).toBe("/issues?page=2");
    expect(isDefault({ ...DEFAULT, page: 2 })).toBe(false);
  });

  it("round-trips through parseFilter", () => {
    expect(parseFilter(searchOf(full))).toEqual(full);
    expect(parseFilter(searchOf({ ...DEFAULT, states: [] }))).toEqual({ ...DEFAULT, states: [] });
  });
});

describe("changing the filter", () => {
  const deep: Filter = { ...DEFAULT, page: 4 };

  it("sends the page back to 1", () => {
    expect(withFilter(deep, { project: "cn" })).toEqual({ ...DEFAULT, project: "cn", page: 1 });
    expect(toggleState(deep, "closed").page).toBe(1);
  });

  it("turns a state on in STATES order, and off", () => {
    expect(toggleState(DEFAULT, "closed").states).toEqual([...LIVE, "closed"]);
    expect(toggleState({ ...DEFAULT, states: ["closed"] }, "open").states).toEqual([
      "open",
      "closed",
    ]);
    expect(toggleState(DEFAULT, "open").states).toEqual(["in_progress", "follow-up"]);
  });
});

describe("narrow, facets and matched", () => {
  it("lets through what every field but the states names, in the order given", () => {
    expect(ids(narrow(all, { ...DEFAULT, project: "cn" }))).toEqual(["cn-3"]);
    expect(ids(narrow(all, { ...DEFAULT, epic: "ep-3" }))).toEqual(["app-4"]);
    expect(ids(narrow(all, { ...DEFAULT, priority: 1 }))).toEqual(["app-2"]);
    expect(ids(narrow(all, { ...DEFAULT, q: "RETRY " }))).toEqual(["app-1"]);
    expect(ids(narrow(all, { ...DEFAULT, q: "cn-" }))).toEqual(["cn-3"]);
    expect(ids(narrow(all, { ...DEFAULT, states: [] }))).toEqual(ids(all));
  });

  it("counts each state over what is let through, whatever is on", () => {
    expect(facets(all)).toEqual({
      in_progress: 1,
      open: 2,
      "follow-up": 1,
      closed: 1,
      dropped: 1,
    });
    expect(facets(narrow(all, { ...DEFAULT, project: "cn", states: [] }))).toEqual({
      in_progress: 0,
      open: 0,
      "follow-up": 1,
      closed: 0,
      dropped: 0,
    });
  });

  it("keeps the states that are on, a group at a time, cn's order kept within one", () => {
    expect(ids(matched(all, DEFAULT))).toEqual(["app-1", "app-2", "app-6", "cn-3"]);
    expect(ids(matched(all, { ...DEFAULT, states: ["dropped", "closed"] }))).toEqual([
      "app-4",
      "app-5",
    ]);
    expect(matched(all, { ...DEFAULT, states: [] })).toEqual([]);
  });
});

describe("pageOf", () => {
  // 10 in progress, 30 open and 20 closed: the open group spans the first two pages.
  const many = [
    ...Array.from({ length: 10 }, (_, k) => listed({ id: `app-${k + 1}`, status: "in_progress" })),
    ...Array.from({ length: 30 }, (_, k) => listed({ id: `app-${k + 11}` })),
    ...Array.from({ length: 20 }, (_, k) => listed({ id: `app-${k + 41}`, status: "closed" })),
  ];

  it("cuts PAGE_SIZE rows a page", () => {
    const first = pageOf(many, 1);
    expect(first).toMatchObject({ page: 1, pages: 3, from: 1, to: PAGE_SIZE, total: 60 });
    expect(first.groups.map((g) => [g.key, g.rows.length])).toEqual([
      ["in_progress", 10],
      ["open", 15],
    ]);
    const last = pageOf(many, 3);
    expect(last).toMatchObject({ page: 3, from: 51, to: 60 });
    expect(ids(last.groups.flatMap((g) => g.rows))).toEqual(ids(many.slice(50)));
  });

  it("gives a group split across two pages its whole count on both, and where its rows fall", () => {
    const open1 = pageOf(many, 1).groups.find((g) => g.key === "open")!;
    const open2 = pageOf(many, 2).groups.find((g) => g.key === "open")!;
    expect(open1).toMatchObject({ title: "Open", count: 30, from: 1, to: 15 });
    expect(open2).toMatchObject({ title: "Open", count: 30, from: 16, to: 30 });
    expect(pageOf(many, 2).groups.find((g) => g.key === "closed")).toMatchObject({
      count: 20,
      from: 1,
      to: 10,
    });
  });

  it("clamps a page past the last", () => {
    expect(pageOf(many, 9)).toMatchObject({ page: 3, from: 51, to: 60 });
  });

  it("is one page with no groups when nothing matches", () => {
    expect(pageOf([], 1)).toEqual({ page: 1, pages: 1, from: 0, to: 0, total: 0, groups: [] });
    expect(pageOf([], 4).page).toBe(1);
  });
});

describe("pageLinks", () => {
  it("lists every page up to seven", () => {
    expect(pageLinks(1, 1)).toEqual([1]);
    expect(pageLinks(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("past seven, the ends and the current page's neighbours, with a gap marked", () => {
    expect(pageLinks(5, 12)).toEqual([1, "…", 4, 5, 6, "…", 12]);
    expect(pageLinks(1, 12)).toEqual([1, 2, "…", 12]);
    expect(pageLinks(12, 12)).toEqual([1, "…", 11, 12]);
    expect(pageLinks(3, 12)).toEqual([1, 2, 3, 4, "…", 12]);
  });
});
