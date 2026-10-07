// The one read over the whole deployment's audit trail: newest first, with whatever an
// event names resolved to id and title, and never a Convex id.
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { actor, historyOf, raise, seed } from "./test.fixtures";

/** A deployment with one project, one epic, two issues and the first claimed. */
async function withClaim() {
  const t = await seed({
    issues: [
      { title: "the first issue", priority: 0 },
      { title: "the second issue", priority: 0 },
    ],
  });
  await t.mutation(api.issues.claim, { actor, id: "cn-1" });
  return t;
}

describe("events.recent", () => {
  it("returns the newest event first, and every `at` non-increasing", async () => {
    const t = await withClaim();
    const events = await t.query(api.events.recent, {});
    expect(events.map((e) => e.kind)).toEqual([
      "issue.claim",
      "issue.create",
      "issue.create",
      "epic.create",
      "project.create",
    ]);
    for (let i = 1; i < events.length; i++)
      expect(events[i - 1]!.at).toBeGreaterThanOrEqual(events[i]!.at);
  });

  it("resolves what an event names, an issue, an epic or a blocker", async () => {
    const t = await withClaim();
    const events = await t.query(api.events.recent, {});
    const claim = events.find((e) => e.kind === "issue.claim");
    expect(claim?.issue).toEqual({ id: "cn-1", title: "the first issue" });
    const epicCreate = events.find((e) => e.kind === "epic.create");
    expect(epicCreate?.epic).toEqual({ id: "ep-1", title: "Create to close" });

    await raise(t, "cn-2", {
      kind: "decision",
      title: "which onboarding copy ships",
      whatResolves: "harbor picks one",
    });
    const withBlocker = await t.query(api.events.recent, {});
    const raised = withBlocker.find((e) => e.kind === "blocker.raise");
    expect(raised?.blocker).toEqual({
      id: "bl-1",
      title: "which onboarding copy ships",
    });
  });

  it("carries the same changes cn-12 recorded for a claim", async () => {
    const t = await withClaim();
    const events = await t.query(api.events.recent, {});
    const claim = events.find((e) => e.kind === "issue.claim");
    expect(claim?.changes).toEqual({
      status: { from: "open", to: "in_progress" },
      claimedBy: { to: actor.name },
    });
  });

  it("pages with limit and before, and walks the whole table with no gap or duplicate", async () => {
    const t = await withClaim();
    const first = await t.query(api.events.recent, { limit: 2 });
    expect(first).toHaveLength(2);

    const rest = await t.query(api.events.recent, {
      limit: 2,
      before: first[1]!.at,
    });
    expect(rest.every((e) => e.at < first[1]!.at)).toBe(true);

    const seen: number[] = [];
    let before: number | undefined;
    for (;;) {
      const page = await t.query(api.events.recent, {
        limit: 2,
        ...(before === undefined ? {} : { before }),
      });
      if (page.length === 0) break;
      seen.push(...page.map((e) => e.at));
      before = page[page.length - 1]!.at;
    }
    const all = await t.query(api.events.recent, { limit: 200 });
    expect(seen).toEqual(all.map((e) => e.at));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("lists an edge once, on the end that leads its sentence, while both ends' histories carry it", async () => {
    const t = await withClaim();
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    await t.mutation(api.edges.add, { actor, from: "cn-2", to: "cn-1", type: "related" });
    const events = await t.query(api.events.recent, {});
    const edges = events.filter((e) => e.kind === "edge.add");
    // `blocks` leads with its `to` end, the way `cn dep add cn-2 --blocked-by cn-1` asked
    // for it; every other type leads with its `from` end.
    expect(edges.map((e) => [e.issue?.id, e.changes])).toEqual([
      ["cn-2", { type: "related", from: "cn-2", to: "cn-1" }],
      ["cn-2", { type: "blocks", from: "cn-1", to: "cn-2" }],
    ]);
    for (const id of ["cn-1", "cn-2"])
      expect((await historyOf(t, id)).filter((e) => e.kind === "edge.add")).toHaveLength(2);
  });

  it("keeps limit honest: a dropped mirror does not shorten a page, and before walks on past it", async () => {
    const t = await withClaim();
    await t.mutation(api.edges.add, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    await t.mutation(api.edges.remove, { actor, from: "cn-1", to: "cn-2", type: "blocks" });
    const all = await t.query(api.events.recent, { limit: 200 });
    expect(all.map((e) => e.kind)).toEqual([
      "edge.remove",
      "edge.add",
      "issue.claim",
      "issue.create",
      "issue.create",
      "epic.create",
      "project.create",
    ]);
    expect((await t.query(api.events.recent, { limit: 3 })).map((e) => e.kind)).toEqual([
      "edge.remove",
      "edge.add",
      "issue.claim",
    ]);
    const seen: string[] = [];
    let before: number | undefined;
    for (;;) {
      const page = await t.query(api.events.recent, {
        limit: 2,
        ...(before === undefined ? {} : { before }),
      });
      if (page.length === 0) break;
      seen.push(...page.map((e) => e.kind));
      before = page[page.length - 1]!.at;
    }
    expect(seen).toEqual(all.map((e) => e.kind));
  });

  it("refuses a limit that is not a whole number from 1 to 200", async () => {
    const t = await withClaim();
    for (const limit of [0, 201, 1.5]) {
      await expect(t.query(api.events.recent, { limit })).rejects.toMatchObject({
        data: { kind: "invalid" },
      });
    }
  });

  it("never carries a Convex id", async () => {
    const t = await withClaim();
    const events = await t.query(api.events.recent, {});
    for (const event of events) {
      const text = JSON.stringify(event);
      expect(text).not.toContain('"_id"');
      expect(text).not.toContain('"issueId"');
      expect(text).not.toContain('"epicId"');
      expect(text).not.toContain('"blockerId"');
      expect(text).not.toContain('"projectId"');
    }
  });

  it("names a project's update by its slug and its name now, and nothing else", async () => {
    const t = await withClaim();
    await t.mutation(api.projects.update, { actor, slug: "cn", revision: 0, name: "renamed" });
    await t.mutation(api.projects.update, { actor, slug: "cn", revision: 1, name: "cairn now" });
    const [latest] = await t.query(api.events.recent, { limit: 1 });
    expect(latest).toMatchObject({
      kind: "project.update",
      revision: 2,
      project: { id: "cn", title: "cairn now" },
    });
    expect(latest!.issue).toBeUndefined();
    expect(latest!.epic).toBeUndefined();
    expect(latest!.blocker).toBeUndefined();
  });
});
