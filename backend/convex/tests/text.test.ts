// An issue's long text lives in `issueText`, apart from the row every list reads
// (docs/design.md §3, "The three content fields"). Each case is a way the split could
// show: text a list still carries, text `cn show` lost, an edit or a close that wrote the
// old place, a move that dropped or doubled a row, or a list that reads its epic once per
// row again.
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { QueryCtx } from "../_generated/server";
import { textOf } from "../lib/text";
import { issueView, lookups } from "../lib/views";
import { type Harness, actor, closeIssue, rawIssue, rows, seed } from "./test.fixtures";

const TEXT = {
  description: "first line\n\nsecond",
  design: "transcribe §3\nthen the functions",
  acceptance: "- it reads the same",
} as const;

/** `cn-1` with all three text fields, created the way `cn create` sends them. */
async function described(): Promise<Harness> {
  const t = await seed();
  await t.mutation(api.issues.create, {
    actor,
    project: "cn",
    epic: "ep-1",
    title: "fix connection retry",
    ...TEXT,
  });
  return t;
}

/**
 * `cn-1` as a row written before 2026-09-30 stands: its text and its proof's output on the
 * row, and no `issueText` row. No verb writes that shape any more, so the test writes it.
 */
async function fromBefore(): Promise<Harness> {
  const t = await seed({ issues: ["fix connection retry"] });
  const doc = await rawIssue(t, "cn-1");
  await t.run((ctx) =>
    ctx.db.patch(doc._id, {
      ...TEXT,
      status: "closed",
      closedAt: Date.now(),
      verification: {
        command: "vp run verify",
        exitCode: 0,
        output: "all green",
        at: Date.now(),
        by: actor,
      },
    }),
  );
  return t;
}

const TEXT_KEYS = ["description", "design", "acceptance"] as const;

describe("issueText", () => {
  it("keeps a created issue's text in the table, not on the row, and show.get reads it", async () => {
    const t = await described();
    const raw = await rawIssue(t, "cn-1");
    for (const key of TEXT_KEYS) expect(raw).not.toHaveProperty(key);
    expect(await rows(t, "issueText")).toEqual([
      expect.objectContaining({ issueId: raw._id, ...TEXT }),
    ]);
    expect(await t.query(api.show.get, { id: "cn-1" })).toMatchObject(TEXT);
  });

  it("writes no text row for an issue created without text", async () => {
    const t = await seed({ issues: ["no text"] });
    expect(await rows(t, "issueText")).toEqual([]);
  });

  it("leaves the text off every list row, and search still matches a description", async () => {
    const t = await described();
    const listed = await t.query(api.issues.list, {});
    const ready = await t.query(api.ready.list, {});
    const found = await t.query(api.search.find, { text: "second" });
    expect(found.map(({ id, matched }) => ({ id, matched }))).toEqual([
      { id: "cn-1", matched: "description" },
    ]);
    for (const row of [...listed, ...ready, ...found])
      for (const key of TEXT_KEYS) expect(row).not.toHaveProperty(key);
  });

  it("writes an edit to the table, records the old and new text, and bumps the row", async () => {
    const t = await described();
    const updated = await t.mutation(api.issues.update, {
      actor,
      id: "cn-1",
      revision: 0,
      description: "a retry loop with no backoff",
    });
    expect(updated.revision).toBe(1);
    const raw = await rawIssue(t, "cn-1");
    expect(raw.revision).toBe(1);
    expect(raw).not.toHaveProperty("description");
    expect(await rows(t, "issueText")).toEqual([
      expect.objectContaining({ ...TEXT, description: "a retry loop with no backoff" }),
    ]);
    const shown = await t.query(api.show.get, { id: "cn-1", history: true });
    expect(shown).toMatchObject({ description: "a retry loop with no backoff" });
    expect("events" in shown && shown.events?.at(-1)).toMatchObject({
      kind: "issue.update",
      revision: 1,
      // The event keeps the first line of each side (lib/events.ts); the table keeps the whole.
      changes: { description: { from: "first line…", to: "a retry loop with no backoff" } },
    });
  });

  it("stores a close's output in the table and show.get prints it whole", async () => {
    const t = await seed({ issues: ["one"] });
    const output = "ok\n".repeat(200);
    await closeIssue(t, "cn-1", 0, {
      verification: { command: "vp run verify", exitCode: 0, output },
    });
    const raw = await rawIssue(t, "cn-1");
    expect(raw.verification).toMatchObject({ command: "vp run verify", exitCode: 0 });
    expect(raw.verification).not.toHaveProperty("output");
    expect(await rows(t, "issueText")).toEqual([expect.objectContaining({ output })]);
    const shown = await t.query(api.show.get, { id: "cn-1" });
    expect(shown).toMatchObject({ verification: { command: "vp run verify", output } });
  });

  it("textOf falls back to the row's own fields for a row the move has not reached", async () => {
    const t = await fromBefore();
    const doc = await rawIssue(t, "cn-1");
    expect(await t.run((ctx) => textOf(ctx, doc))).toEqual({ ...TEXT, output: "all green" });
  });

  it("search matches a description the row still carries, before the move reaches it", async () => {
    const t = await fromBefore();
    const found = await t.query(api.search.find, { text: "second" });
    expect(found.map(({ id, matched }) => ({ id, matched }))).toEqual([
      { id: "cn-1", matched: "description" },
    ]);
  });

  it("moves a row's text into the table once, and show.get answers the same", async () => {
    const t = await fromBefore();
    const before = await t.query(api.show.get, { id: "cn-1" });
    expect(before).toMatchObject({ ...TEXT, verification: { output: "all green" } });

    expect(await t.mutation(internal.issueText.move, {})).toEqual({ moved: 1, issues: 1 });
    const raw = await rawIssue(t, "cn-1");
    for (const key of TEXT_KEYS) expect(raw).not.toHaveProperty(key);
    expect(raw.verification).toMatchObject({ command: "vp run verify", exitCode: 0, by: actor });
    expect(raw.verification).not.toHaveProperty("output");
    expect(await rows(t, "issueText")).toHaveLength(1);
    expect(await t.query(api.show.get, { id: "cn-1" })).toEqual(before);

    expect(await t.mutation(internal.issueText.move, {})).toEqual({ moved: 0, issues: 1 });
    expect(await rows(t, "issueText")).toHaveLength(1);
  });

  it("keeps a text the table already holds over the row's older one when it moves", async () => {
    const t = await fromBefore();
    const doc = await rawIssue(t, "cn-1");
    // An edit made after the push and before the move wrote the table, not the row.
    await t.run((ctx) => ctx.db.insert("issueText", { issueId: doc._id, design: "the newer" }));
    await t.mutation(internal.issueText.move, {});
    expect(await rows(t, "issueText")).toEqual([
      expect.objectContaining({ ...TEXT, design: "the newer", output: "all green" }),
    ]);
  });
});

describe("issueView", () => {
  it("reads a project and an epic once for every row that shares a lookup", async () => {
    const t = await seed({ issues: ["one", "two", "three"] });
    const docs = await rows(t, "issues");
    const reads = await t.run(async (ctx) => {
      let gets = 0;
      // Counts every document read the views make, so a lookup that asked twice shows.
      const db = new Proxy(ctx.db, {
        get(target, key) {
          const value = Reflect.get(target, key);
          if (key !== "get" || typeof value !== "function") return value;
          return (...args: unknown[]) => {
            gets += 1;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      });
      const counted = { ...ctx, db } as QueryCtx;
      const seen = lookups();
      await Promise.all(docs.map((doc) => issueView(counted, doc, seen)));
      const shared = { gets, projects: seen.projects.size, epics: seen.epics.size };
      gets = 0;
      await Promise.all(docs.map((doc) => issueView(counted, doc)));
      return { shared, alone: gets };
    });
    expect(reads).toEqual({ shared: { gets: 2, projects: 1, epics: 1 }, alone: 6 });
  });
});
