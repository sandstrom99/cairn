// issues.ts: the Issues page's filter, beside projects.ts and brief.ts. The page holds
// every issue `issues.list` answers and narrows them here, so a filter asks the deployment
// nothing. The filter is the query string, so a filtered page is a link and the back button
// steps through filters: `parseFilter` reads one, `searchOf` writes one, and a string it
// cannot read falls back to the default rather than to an error. The five states are the
// groups the rows stand in, counted over what the other fields let through, so a chip says
// what turning it on would add; what matches is cut into pages of PAGE_SIZE rows, a group
// split across two pages carrying its whole count on both.
import { SLUG } from "./location.ts";
import type { Listed } from "./rows.tsx";

/** The five states a row can be in, in the order the groups list them. */
export type StateKey = "in_progress" | "open" | "follow-up" | "closed" | "dropped";

export const STATES: { key: StateKey; title: string; pick: (issue: Listed) => boolean }[] = [
  { key: "in_progress", title: "In progress", pick: (i) => i.status === "in_progress" },
  { key: "open", title: "Open", pick: (i) => i.status === "open" && i.type !== "follow-up" },
  {
    key: "follow-up",
    title: "Follow-ups",
    pick: (i) => i.status === "open" && i.type === "follow-up",
  },
  { key: "closed", title: "Closed", pick: (i) => i.status === "closed" },
  { key: "dropped", title: "Dropped", pick: (i) => i.status === "dropped" },
];

/** The states on when nothing says otherwise: what is not finished. */
export const LIVE: readonly StateKey[] = ["in_progress", "open", "follow-up"];

export const PAGE_SIZE = 25;

export type Filter = {
  /** In STATES order; `[]` is every state turned off. */
  states: StateKey[];
  /** A project's slug. */
  project?: string;
  /** An epic's id, `ep-3`. */
  epic?: string;
  /** 0 to 4, 0 highest and 4 backlog, as the deployment takes it. */
  priority?: number;
  /** Matched against the title and the id, case aside; `""` is none. */
  q: string;
  /** 1-based. */
  page: number;
};

export const DEFAULT: Filter = { states: [...LIVE], q: "", page: 1 };

const EPIC = /^ep-\d+$/;
const KEYS = new Set<string>(STATES.map((s) => s.key));

/** Keys in STATES order, each once. */
const ordered = (keys: Iterable<string>): StateKey[] => {
  const set = new Set(keys);
  return STATES.map((s) => s.key).filter((k) => set.has(k));
};

/** The filter a query string names; anything it cannot read is left at the default. */
export function parseFilter(search: string): Filter {
  const params = new URLSearchParams(search);
  const status = params.get("status");
  const named = status === null ? [] : ordered(status.split(",").filter((k) => KEYS.has(k)));
  const states = status === "none" ? [] : named.length > 0 ? named : [...LIVE];
  const project = params.get("project") ?? "";
  const epic = params.get("epic") ?? "";
  const priority = params.get("priority") ?? "";
  // Only the start is trimmed: the field is drawn from this, and a trailing space is the one
  // typed between two words.
  const q = (params.get("q") ?? "").trimStart();
  const page = params.get("page") ?? "";
  return {
    states,
    ...(SLUG.test(project) && { project }),
    ...(EPIC.test(epic) && { epic }),
    ...(/^[0-4]$/.test(priority) && { priority: Number(priority) }),
    q,
    page: /^\d+$/.test(page) && Number(page) >= 1 ? Number(page) : 1,
  };
}

const sameStates = (a: readonly StateKey[], b: readonly StateKey[]): boolean =>
  a.length === b.length && a.every((k) => b.includes(k));

/**
 * The query string that names a filter: `""` for the default, else `?key=…` with only what
 * differs, in the order status, project, epic, priority, q, page. The state keys are joined
 * with a bare comma, which no key holds, so the link reads as it is typed.
 */
export function searchOf(filter: Filter): string {
  const pairs: string[] = [];
  if (!sameStates(filter.states, LIVE))
    pairs.push(`status=${filter.states.length === 0 ? "none" : ordered(filter.states).join(",")}`);
  const put = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") pairs.push(`${key}=${encodeURIComponent(value)}`);
  };
  put("project", filter.project);
  put("epic", filter.epic);
  put("priority", filter.priority);
  put("q", filter.q);
  if (filter.page > 1) put("page", filter.page);
  return pairs.length === 0 ? "" : `?${pairs.join("&")}`;
}

/** A filter with one field changed and the page back at 1. */
export const withFilter = (filter: Filter, change: Partial<Omit<Filter, "page">>): Filter => ({
  ...filter,
  ...change,
  page: 1,
});

/** The filter with one state turned on or off, and the page back at 1. */
export function toggleState(filter: Filter, key: StateKey): Filter {
  const states = filter.states.includes(key)
    ? filter.states.filter((k) => k !== key)
    : ordered([...filter.states, key]);
  return { ...filter, states, page: 1 };
}

/** `/issues` plus the filter's query string. */
export const hrefOf = (filter: Filter): string => `/issues${searchOf(filter)}`;

/** Whether anything differs from the default. */
export const isDefault = (filter: Filter): boolean => searchOf(filter) === "";

/** The issues every field but the states lets through, in the order given. */
export function narrow(issues: Listed[], filter: Filter): Listed[] {
  const q = filter.q.trim().toLowerCase();
  return issues.filter(
    (i) =>
      (filter.project === undefined || i.project === filter.project) &&
      (filter.epic === undefined || i.epic.id === filter.epic) &&
      (filter.priority === undefined || i.priority === filter.priority) &&
      (q === "" || i.title.toLowerCase().includes(q) || i.id.includes(q)),
  );
}

/** How many of `narrowed` each state would show: the count on its chip. */
export function facets(narrowed: Listed[]): Record<StateKey, number> {
  const counts = Object.fromEntries(STATES.map((s) => [s.key, 0])) as Record<StateKey, number>;
  for (const issue of narrowed) {
    const state = STATES.find((s) => s.pick(issue));
    if (state) counts[state.key] += 1;
  }
  return counts;
}

/** `narrowed` cut to the states that are on, group-major in STATES order, cn's order kept within a group. */
export const matched = (narrowed: Listed[], filter: Filter): Listed[] =>
  STATES.filter((s) => filter.states.includes(s.key)).flatMap((s) => narrowed.filter(s.pick));

export type PageOf = {
  /** Clamped into 1..pages. */
  page: number;
  /** At least 1. */
  pages: number;
  /** 1-based inclusive row numbers on this page; 0 and 0 when there are none. */
  from: number;
  to: number;
  total: number;
  /** The groups with rows on this page: `count` is the group's whole, `from` and `to` this page's rows of it, 1-based. */
  groups: {
    key: StateKey;
    title: string;
    count: number;
    from: number;
    to: number;
    rows: Listed[];
  }[];
};

/** One page of the matched list: the slice, re-grouped, with each group's whole count beside its rows. */
export function pageOf(matchedIssues: Listed[], page: number): PageOf {
  const total = matchedIssues.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const at = Math.min(Math.max(1, Math.floor(page)), pages);
  const start = (at - 1) * PAGE_SIZE;
  const counts = new Map<StateKey, number>();
  // Each issue's state and its 1-based place in that state's group, in the order given.
  const placed = matchedIssues.flatMap((issue) => {
    const state = STATES.find((s) => s.pick(issue));
    if (!state) return [];
    const place = (counts.get(state.key) ?? 0) + 1;
    counts.set(state.key, place);
    return [{ issue, state, place }];
  });
  const groups: PageOf["groups"] = [];
  for (const { issue, state, place } of placed.slice(start, start + PAGE_SIZE)) {
    const last = groups.at(-1);
    if (last?.key === state.key) {
      last.rows.push(issue);
      last.to = place;
    } else
      groups.push({
        key: state.key,
        title: state.title,
        count: 0,
        from: place,
        to: place,
        rows: [issue],
      });
  }
  for (const group of groups) group.count = counts.get(group.key) ?? 0;
  const shown = Math.min(PAGE_SIZE, Math.max(0, total - start));
  return {
    page: at,
    pages,
    from: shown === 0 ? 0 : start + 1,
    to: shown === 0 ? 0 : start + shown,
    total,
    groups,
  };
}

/** The page numbers a pager shows: every one up to 7, else the first, the last, the current and its neighbours, with `"…"` where numbers are skipped. */
export function pageLinks(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, k) => k + 1);
  const shown = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  return shown.flatMap((n, k) => (k > 0 && n - shown[k - 1]! > 1 ? ["…" as const, n] : [n]));
}
