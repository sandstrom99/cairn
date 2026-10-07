// A project is the id prefix and a name. The rules worth a test are the ones that would
// corrupt an id: a slug that cannot be a prefix, one reserved for epics or blockers, and
// a second project claiming a prefix that is already minting. Beside them is what
// `projects.list` reads for each (docs/design.md §8): the epic's three health lines over
// the project's issues, and, for a caller that asks, its pulse of the last 28 UTC days and
// the rebuild that recounts it from the events. Then `update`: the name, the
// description and the links, against a revision a project from before cn-125 reads as 0.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { DAY, PULSE_DAYS } from "../lib/thresholds";
import {
  type Harness,
  actor,
  at,
  closeIssue,
  eventsOf,
  fresh,
  other,
  raise,
  rows,
  seed,
} from "./test.fixtures";

afterEach(() => vi.useRealTimers());

/** A project as `cn project list` reads it, pulse included, at `now` when the caller says. */
const projectOf = async (t: Harness, slug = "cn", now?: number) => {
  const listed = await t.query(
    api.projects.list,
    now === undefined ? { pulse: true } : { now, pulse: true },
  );
  const project = listed.find((p) => p.slug === slug);
  if (!project) throw new Error(`${slug} is not listed`);
  return project;
};

const EMPTY_PULSE = Array.from({ length: PULSE_DAYS }, () => ({ events: 0, closes: 0 }));

describe("projects", () => {
  it("creates a project and lists it by slug", async () => {
    const t = fresh();
    await t.mutation(api.projects.create, { actor, slug: "web", name: "northwind.example" });
    await t.mutation(api.projects.create, { actor, slug: "app", name: "the Flutter app" });
    const listed = await t.query(api.projects.list, {});
    expect(listed.map(({ slug, name }) => ({ slug, name }))).toEqual([
      { slug: "app", name: "the Flutter app" },
      { slug: "web", name: "northwind.example" },
    ]);
  });

  it("refuses a slug that cannot be an id prefix", async () => {
    const t = fresh();
    await expect(
      t.mutation(api.projects.create, { actor, slug: "Web App", name: "x" }),
    ).rejects.toMatchObject({ data: { kind: "invalid" } });
  });

  it("refuses ep and bl, which epics and blockers mint from", async () => {
    const t = fresh();
    for (const slug of ["ep", "bl"]) {
      await expect(
        t.mutation(api.projects.create, { actor, slug, name: "x" }),
      ).rejects.toMatchObject({ data: { kind: "invalid" } });
    }
  });

  it("refuses a slug that already exists", async () => {
    const t = fresh();
    await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
    await expect(
      t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn again" }),
    ).rejects.toMatchObject({ data: { kind: "conflict" } });
  });

  it("records one project.create event", async () => {
    const t = fresh();
    await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
    const events = await eventsOf(t);
    expect(events).toHaveLength(1);
    const [project] = await rows(t, "projects");
    expect(events[0]).toMatchObject({
      kind: "project.create",
      actor,
      projectId: project!._id,
      changes: { slug: "cn", name: "cairn" },
    });
  });

  it("creates a project with a description and links, at revision 0", async () => {
    const t = fresh();
    const created = await t.mutation(api.projects.create, {
      actor,
      slug: "cn",
      name: "cairn",
      description: "not the marketing site",
      link: [{ url: "https://example.com/repo", label: "repo" }, { url: "https://example.com/b" }],
    });
    expect(created).toMatchObject({ slug: "cn", name: "cairn", revision: 0 });
    const listed = await projectOf(t);
    expect(listed).toMatchObject({
      slug: "cn",
      name: "cairn",
      description: "not the marketing site",
      revision: 0,
      links: [
        { url: "https://example.com/repo", label: "repo", by: actor, at: expect.any(Number) },
        { url: "https://example.com/b", by: actor, at: expect.any(Number) },
      ],
    });
  });

  it("creates a project without them as no description, no links and revision 0", async () => {
    const t = fresh();
    await t.mutation(api.projects.create, { actor, slug: "cn", name: "cairn" });
    const listed = await projectOf(t);
    expect(listed.description).toBeUndefined();
    expect(listed.links).toBeUndefined();
    expect(listed.revision).toBe(0);
    const [row] = await rows(t, "projects");
    expect(row).not.toHaveProperty("description");
    expect(row).not.toHaveProperty("links");
  });
});

describe("projects.update", () => {
  /** One project, `cn`, named "cairn" with the repository linked, at revision 0. */
  const project = async (): Promise<Harness> => {
    const t = fresh();
    await t.mutation(api.projects.create, {
      actor,
      slug: "cn",
      name: "cairn",
      link: [{ url: "https://example.com/repo", label: "repo" }],
    });
    return t;
  };

  it("changes the name, the description and the links, and records one project.update", async () => {
    const t = await project();
    const updated = await t.mutation(api.projects.update, {
      actor,
      slug: "cn",
      revision: 0,
      name: "cairn: the worklist",
      description: "why",
      link: [{ url: "https://example.com/b" }],
      unlink: ["https://example.com/repo"],
    });
    expect(updated).toMatchObject({
      slug: "cn",
      name: "cairn: the worklist",
      description: "why",
      revision: 1,
      links: [{ url: "https://example.com/b", by: actor }],
    });
    const [row] = await rows(t, "projects");
    const events = await eventsOf(t, "project.update");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor,
      projectId: row!._id,
      revision: 1,
      changes: {
        name: { from: "cairn", to: "cairn: the worklist" },
        description: { to: "why" },
        links: {
          from: [{ url: "https://example.com/repo", label: "repo" }],
          to: [{ url: "https://example.com/b" }],
        },
      },
    });
  });

  it("refuses a stale revision by slug, with the project.update since it", async () => {
    const t = await project();
    await t.mutation(api.projects.update, { actor, slug: "cn", revision: 0, name: "one" });
    await expect(
      t.mutation(api.projects.update, { actor: other, slug: "cn", revision: 0, name: "two" }),
    ).rejects.toMatchObject({
      data: {
        kind: "stale",
        id: "cn",
        yours: 0,
        current: 1,
        since: [{ revision: 1, actor, kind: "project.update" }],
      },
    });
  });

  it("refuses a name with nothing in it, and an edit with nothing to change", async () => {
    const t = await project();
    await expect(
      t.mutation(api.projects.update, { actor, slug: "cn", revision: 0, name: "  " }),
    ).rejects.toMatchObject({ data: { kind: "invalid", message: "a project needs a name" } });
    await expect(
      t.mutation(api.projects.update, { actor, slug: "cn", revision: 0 }),
    ).rejects.toMatchObject({ data: { kind: "invalid", message: "nothing to update" } });
  });

  it("hands the project back as it was on a bare re-link, with no revision and no event", async () => {
    const t = await project();
    const same = await t.mutation(api.projects.update, {
      actor,
      slug: "cn",
      revision: 0,
      link: [{ url: "https://example.com/repo" }],
    });
    expect(same).toMatchObject({ revision: 0, links: [{ label: "repo" }] });
    expect(await eventsOf(t, "project.update")).toEqual([]);
  });

  it("refuses unlinking a URL it does not carry, and a slug it does not have, naming each", async () => {
    const t = await project();
    await expect(
      t.mutation(api.projects.update, {
        actor,
        slug: "cn",
        revision: 0,
        unlink: ["https://example.com/missing"],
      }),
    ).rejects.toMatchObject({
      data: { kind: "invalid", message: "cn has no link https://example.com/missing" },
    });
    await expect(
      t.mutation(api.projects.update, { actor, slug: "nope", revision: 0, name: "x" }),
    ).rejects.toMatchObject({ data: { kind: "not-found", message: "no such project nope" } });
  });

  it("reads a project stored before cn-125, with no revision, as 0 and updates it to 1", async () => {
    const t = fresh();
    await t.run(async (ctx) => {
      await ctx.db.insert("projects", { slug: "old", name: "from before" });
    });
    expect(await projectOf(t, "old")).toMatchObject({ slug: "old", revision: 0 });
    const updated = await t.mutation(api.projects.update, {
      actor,
      slug: "old",
      revision: 0,
      description: "now described",
    });
    expect(updated).toMatchObject({ revision: 1, description: "now described" });
    const [row] = await rows(t, "projects");
    expect(row!.revision).toBe(1);
  });
});

describe("project health", () => {
  it("reads a project nothing is filed under as zeros, empty lines and an empty pulse", async () => {
    const t = fresh();
    await t.mutation(api.projects.create, { actor, slug: "admin", name: "the admin app" });
    expect(await projectOf(t, "admin")).toEqual({
      slug: "admin",
      name: "the admin app",
      revision: 0,
      filed: 0,
      counts: { open: 0, inProgress: 0, closed: 0, dropped: 0, followUps: 0 },
      health: { moving: [], stuck: [], waiting: [] },
      pulse: EMPTY_PULSE,
    });
  });

  it("leaves every line empty while the issues filed are fresh and nothing moves", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seed({ issues: [{ title: "work 1", priority: 0 }, "work 2", "work 3"] });
    const project = await projectOf(t, "cn", Date.now() + 60 * 60 * 1000);
    expect(project.filed).toBe(3);
    expect(project.counts).toMatchObject({ open: 3, inProgress: 0 });
    expect(project.health).toEqual({ moving: [], stuck: [], waiting: [] });
  });

  it("names what is moving, what is stuck and what is waiting", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seed({
      issues: [
        { title: "work 1", priority: 0 },
        { title: "work 2", priority: 0 },
        { title: "work 3", priority: 0 },
      ],
    });
    const claimedAt = Date.now();
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    await raise(t, "cn-3");
    const { health } = await projectOf(t, "cn", claimedAt + DAY + 1);
    expect(health.moving).toMatchObject([{ id: "cn-1", title: "work 1", claimedBy: actor }]);
    expect(health.stuck).toMatchObject([{ id: "cn-2", title: "work 2" }]);
    expect(health.waiting).toEqual([
      { id: "bl-1", title: "the App Store agreement", owner: "harbor" },
    ]);
  });

  it("reads the same health as an epic that holds the same issues", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seed({
      issues: [
        { title: "work 1", priority: 0 },
        { title: "work 2", priority: 0 },
        { title: "work 3", priority: 0 },
        "work 4",
      ],
    });
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });
    await raise(t, "cn-3");
    const now = Date.parse("2026-09-19T09:00:00Z");
    const epic = (await t.query(api.epics.list, { all: true, now })).find((e) => e.id === "ep-1");
    const project = await projectOf(t, "cn", now);
    expect(project.health.stuck).toHaveLength(1);
    expect(project.health).toEqual(epic!.health);
    expect(project.counts).toEqual(epic!.counts);
  });

  it("counts each day's events on the project's issues and its closes, an edge once", async () => {
    at("2026-08-01T09:00:00Z");
    const t = await seed({ issues: ["long ago"] });
    at("2026-09-17T09:00:00Z");
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "first" });
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "second" });
    at("2026-09-17T10:00:00Z");
    await t.mutation(api.edges.add, { actor, from: "cn-2", to: "cn-3", type: "blocks" });
    at("2026-09-18T09:00:00Z");
    await t.mutation(api.journal.append, { actor, id: "cn-2", kind: "finding", body: "a finding" });
    at("2026-09-19T09:00:00Z");
    await closeIssue(t, "cn-2");
    const now = Date.parse("2026-09-19T12:00:00Z");

    const pulse = (await projectOf(t, "cn", now)).pulse!;
    expect(pulse).toHaveLength(PULSE_DAYS);
    // Two creates and one edge, written on both ends, on 2026-09-17: two UTC days back.
    expect(pulse[PULSE_DAYS - 3]).toEqual({ events: 3, closes: 0 });
    // The journal entry, on 2026-09-18: yesterday.
    expect(pulse[PULSE_DAYS - 2]).toEqual({ events: 1, closes: 0 });
    // The close, on 2026-09-19: today so far.
    expect(pulse[PULSE_DAYS - 1]).toEqual({ events: 1, closes: 1 });
    expect(pulse.slice(0, PULSE_DAYS - 3)).toEqual(EMPTY_PULSE.slice(3));

    // cn-1's create is 49 days back and counts nowhere; `cn log` agrees on every other row.
    const logged = (await t.query(api.events.recent, { limit: 200 })).filter(
      (e) => e.issue?.id.startsWith("cn-") && e.at > now - PULSE_DAYS * DAY,
    );
    expect(pulse.reduce((sum, day) => sum + day.events, 0)).toBe(logged.length);
  });

  it("a row without pulse: true carries no pulse", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seed({ issues: ["work 1"] });
    const now = Date.parse("2026-09-17T12:00:00Z");
    const [project] = await t.query(api.projects.list, { now });
    expect(project!.pulse).toBeUndefined();
  });

  it("events either side of a UTC midnight fall in different days", async () => {
    at("2026-09-18T23:59:00Z");
    const t = await seed({ issues: [] });
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "late" });
    at("2026-09-19T00:01:00Z");
    await t.mutation(api.journal.append, { actor, id: "cn-1", kind: "finding", body: "early" });
    const now = Date.parse("2026-09-19T12:00:00Z");

    const pulse = (await projectOf(t, "cn", now)).pulse!;
    expect(pulse[PULSE_DAYS - 2]).toEqual({ events: 1, closes: 0 });
    expect(pulse[PULSE_DAYS - 1]).toEqual({ events: 1, closes: 0 });
  });

  it("rebuild recounts the pulse from the events", async () => {
    at("2026-08-01T09:00:00Z");
    const t = await seed({ issues: ["long ago"] });
    at("2026-09-17T09:00:00Z");
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "first" });
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "second" });
    at("2026-09-17T10:00:00Z");
    await t.mutation(api.edges.add, { actor, from: "cn-2", to: "cn-3", type: "blocks" });
    at("2026-09-18T09:00:00Z");
    await t.mutation(api.journal.append, { actor, id: "cn-2", kind: "finding", body: "a finding" });
    at("2026-09-19T09:00:00Z");
    await closeIssue(t, "cn-2");
    const now = Date.parse("2026-09-19T12:00:00Z");
    const before = (await projectOf(t, "cn", now)).pulse;

    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("pulse").collect()) await ctx.db.delete(row._id);
    });
    expect((await projectOf(t, "cn", now)).pulse).toEqual(EMPTY_PULSE);

    // Every event on an issue but the edge's mirror is counted, cn-1's create of 2026-08-01
    // included, which is stored though no window reads it: four days, so four rows.
    const onIssues = (await rows(t, "events")).filter((e) => e.issueId !== undefined);
    const first = await t.mutation(internal.pulse.rebuild, {});
    expect((await projectOf(t, "cn", now)).pulse).toEqual(before);
    expect(first).toEqual({ events: onIssues.length - 1, rows: 4 });

    const again = await t.mutation(internal.pulse.rebuild, {});
    expect(again).toEqual(first);
    expect((await projectOf(t, "cn", now)).pulse).toEqual(before);
  });
});
