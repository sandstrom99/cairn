// A project is the id prefix and a name. The rules worth a test are the ones that would
// corrupt an id: a slug that cannot be a prefix, one reserved for epics or blockers, and
// a second project claiming a prefix that is already minting. Beside them is what
// `projects.list` reads for each (docs/design.md §8): the epic's three health lines over
// the project's issues, and its pulse of the last 28 days.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { DAY, PULSE_DAYS } from "../lib/thresholds";
import { type Harness, actor, at, closeIssue, eventsOf, fresh, raise, seed } from "./test.fixtures";

afterEach(() => vi.useRealTimers());

/** A project as `cn project list` reads it, at `now` when the caller says. */
const projectOf = async (t: Harness, slug = "cn", now?: number) => {
  const listed = await t.query(api.projects.list, now === undefined ? {} : { now });
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
    expect(events[0]).toMatchObject({
      kind: "project.create",
      actor,
      changes: { slug: "cn", name: "cairn" },
    });
  });
});

describe("project health", () => {
  it("reads a project nothing is filed under as zeros, empty lines and an empty pulse", async () => {
    const t = fresh();
    await t.mutation(api.projects.create, { actor, slug: "admin", name: "the admin app" });
    expect(await projectOf(t, "admin")).toEqual({
      slug: "admin",
      name: "the admin app",
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
      { id: "bl-1", title: "the App Store agreement", owner: "balder" },
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

    const { pulse } = await projectOf(t, "cn", now);
    expect(pulse).toHaveLength(PULSE_DAYS);
    // Two creates and one edge, written on both ends, 51 hours back: day 2.
    expect(pulse[PULSE_DAYS - 3]).toEqual({ events: 3, closes: 0 });
    // The journal entry, 27 hours back: day 1.
    expect(pulse[PULSE_DAYS - 2]).toEqual({ events: 1, closes: 0 });
    // The close, 3 hours back: the last 24 hours.
    expect(pulse[PULSE_DAYS - 1]).toEqual({ events: 1, closes: 1 });
    expect(pulse.slice(0, PULSE_DAYS - 3)).toEqual(EMPTY_PULSE.slice(3));

    // cn-1's create is 49 days back and counts nowhere; `cn log` agrees on every other row.
    const logged = (await t.query(api.events.recent, { limit: 200 })).filter(
      (e) => e.issue?.id.startsWith("cn-") && e.at > now - PULSE_DAYS * DAY,
    );
    expect(pulse.reduce((sum, day) => sum + day.events, 0)).toBe(logged.length);
  });
});
