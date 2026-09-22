// test.fixtures.ts: the one deployment every test starts from, and the reads and moves
// the files share, so no file spells out the opening, the clock, the raw lookup or the
// event readers for itself. Every state a test needs is made by the verb that makes it
// in production, never written into a table: a closed issue is `issues.close`, a held
// one is `blockers.raise`, an old one is the clock moved on. A test that reaches
// `ctx.db` reads; it writes only through a `lib/` helper it is the test of.
//
// Two dots in the name on purpose: a push bundles every `.ts` under convex/ with one dot
// as a function module, and `import.meta.glob` below cannot run there. Convex skips a
// name with more than one dot, which is the same rule that keeps `*.test.ts` out, and
// convex-test's own docs name their glob file `test.setup.ts` for it.
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { vi } from "vitest";
import { api } from "../_generated/api";
import type { TableNames } from "../_generated/dataModel";
import schema from "../schema";

/** This session's agent, an agent on another machine, and the person. */
export const actor = { name: "wsl/claude", kind: "agent" } as const;
export const other = { name: "mac/claude", kind: "agent" } as const;
export const balder = { name: "wsl/balder", kind: "human" } as const;

const modules = import.meta.glob("../**/*.ts");

/** An empty deployment against the real schema. */
export const fresh = () => convexTest(schema, modules);

export type Harness = ReturnType<typeof fresh>;

export type SeedIssue = string | { title: string; priority?: number };

/**
 * The project `cn`, `ep-1 "Create to close"`, and the issues given in order, so the
 * first is cn-1: what every file's opening used to spell out for itself.
 */
export async function seed({ issues = [] }: { issues?: SeedIssue[] } = {}): Promise<Harness> {
  const t = fresh();
  await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
  await t.mutation(api.epics.create, { actor, title: "Create to close" });
  for (const issue of issues) {
    const { title, priority } = typeof issue === "string" ? { title: issue } : issue;
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-1",
      title,
      ...(priority === undefined ? {} : { priority }),
    });
  }
  return t;
}

/**
 * Moves the clock, and only the clock: convex-test's own async stays real, and
 * `_creationTime` and every `Date.now()` inside a function follow it. `"all"` fakes
 * every timer too, for a scheduler driven by `vi.runAllTimers`. A file that calls it
 * puts `afterEach(() => vi.useRealTimers())` beside its imports.
 */
export const at = (when: string | number, timers: "date" | "all" = "date"): void => {
  vi.useFakeTimers(timers === "date" ? { toFake: ["Date"] } : {});
  vi.setSystemTime(typeof when === "string" ? new Date(when) : when);
};

/** Every row of a table, in creation order. A read, never a write. */
export const rows = <T extends TableNames>(t: Harness, table: T) =>
  t.run((ctx) => ctx.db.query(table).collect());

/** An issue as it stands in the table, past any view. */
export const rawIssue = (t: Harness, id: string) =>
  t.run((ctx) =>
    ctx.db
      .query("issues")
      .withIndex("by_public_id", (q) => q.eq("id", id))
      .unique(),
  );

/** Every event, oldest first, or the events of one kind. */
export const eventsOf = async (t: Harness, kind?: string) => {
  const all = await rows(t, "events");
  return kind === undefined ? all : all.filter((e) => e.kind === kind);
};

/** What `cn show <id> --history` lists: the thing's own events, oldest first. */
export const historyOf = async (t: Harness, id: string) => {
  const shown = await t.query(api.show.get, { id, history: true });
  return "events" in shown ? (shown.events ?? []) : [];
};

/** A verification that passed, the way `cn close --run 'vp run verify'` records one. */
export const ran = { command: "vp run verify", exitCode: 0, output: "all green" } as const;

type CloseArgs = FunctionArgs<typeof api.issues.close>;

/** `issues.close` with `ran`, at the revision given: the one way an issue becomes closed. */
export const closeIssue = (
  t: Harness,
  id: string,
  revision = 0,
  extra: Partial<Pick<CloseArgs, "actor" | "verification" | "followUp">> = {},
) => t.mutation(api.issues.close, { actor, id, revision, verification: ran, ...extra });

/** The fields of a new blocker, as `cn wait --kind approval --owner balder …` sends them. */
export const APPROVAL = {
  kind: "approval",
  owner: "balder",
  title: "the App Store agreement",
  whatResolves: "accept it in App Store Connect",
} as const;

type RaiseArgs = FunctionArgs<typeof api.blockers.raise>;

/** `blockers.raise` on an issue with `APPROVAL`'s fields, and whatever is given over them. */
export const raise = (t: Harness, issue: string, fields: Partial<Omit<RaiseArgs, "issue">> = {}) =>
  t.mutation(api.blockers.raise, { actor, issue, ...APPROVAL, ...fields });
