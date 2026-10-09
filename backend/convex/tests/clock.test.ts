// `clock.next` is the page's timer (design §10): the earliest moment after the caller's clock
// at which a line drawn from the clock may change with no write. A moment it misses is a line
// that never appears on a page left open, so every candidate is pinned here to the exact
// millisecond, and the last block holds the promise itself: a query sent the answer draws the
// line the query sent the clock before it did not, and not a millisecond sooner.
//
// Each `now` is chosen inside a UTC day so that the moment under test falls before the next
// midnight, which is always a candidate and would otherwise be the answer.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { DAY, HOUR, fadedAt } from "../lib/thresholds";
import { type Harness, actor, at, closeIssue, fresh, raise, rawIssue, seed } from "./test.fixtures";

afterEach(() => vi.useRealTimers());

const next = (t: Harness, now: number) => t.query(api.clock.next, { now });

/** The midnight that ends 2026-09-17, UTC, and the one after it. */
const MIDNIGHT = Date.UTC(2026, 8, 18);

/** One open issue, cn-1 at P1, touched last at 09:00 on 2026-09-15. */
async function stale() {
  at("2026-09-15T09:00:00Z");
  const t = await seed({ issues: [{ title: "a", priority: 1 }] });
  return { t, lastActivity: (await rawIssue(t, "cn-1")).lastActivity };
}

/** cn-1 claimed at 00:30 on 2026-09-17, with nothing journaled. */
async function claimed() {
  at("2026-09-17T00:30:00Z");
  const t = await seed({ issues: ["a"] });
  await t.mutation(api.issues.claim, { actor, id: "cn-1" });
  return { t, claimedAt: (await rawIssue(t, "cn-1")).claimedAt! };
}

describe("clock.next", () => {
  it("is the next UTC midnight with nothing live, even a millisecond before it", async () => {
    const t = fresh();
    expect(await next(t, Date.parse("2026-09-17T09:00:00Z"))).toBe(MIDNIGHT);
    expect(await next(t, MIDNIGHT - 1)).toBe(MIDNIGHT);
    expect(await next(t, MIDNIGHT)).toBe(MIDNIGHT + DAY);
  });

  it("is the moment an open issue turns stuck, and nothing for a priority never stuck", async () => {
    const { t, lastActivity } = await stale();
    expect(await next(t, Date.parse("2026-09-18T01:00:00Z"))).toBe(lastActivity + 3 * DAY + 1);

    at("2026-09-15T09:00:00Z");
    const backlog = await seed({ issues: [{ title: "a", priority: 3 }] });
    expect(await next(backlog, Date.parse("2026-09-18T01:00:00Z"))).toBe(MIDNIGHT + DAY);
  });

  it("is a deferral passing, and an issue deferred past its limit turns stuck no sooner", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seed({ issues: [{ title: "a", priority: 0 }] });
    const deferUntil = Date.parse("2026-09-19T12:00:00Z");
    await t.mutation(api.issues.update, { actor, id: "cn-1", revision: 0, deferUntil });

    const now = Date.parse("2026-09-19T01:00:00Z");
    expect(await next(t, now)).toBe(deferUntil);
    expect(await t.query(api.show.get, { id: "cn-1", now: deferUntil - 1 })).toMatchObject({
      stuck: false,
    });
    expect(await t.query(api.show.get, { id: "cn-1", now: deferUntil })).toMatchObject({
      stuck: true,
    });
  });

  it("is a claim turning quiet, counted from the claim and then from its newest entry", async () => {
    const { t, claimedAt } = await claimed();
    expect(await next(t, claimedAt)).toBe(claimedAt + HOUR + 1);

    at("2026-09-17T00:45:00Z");
    const entry = await t.mutation(api.journal.append, {
      actor,
      id: "cn-1",
      kind: "finding",
      body: "here",
    });
    // `_creationTime` carries a fraction under convex-test; the answer is whole milliseconds.
    expect(await next(t, entry.at)).toBe(Math.ceil(entry.at + HOUR + 1));
  });

  it("is a claim turning silent once it is past quiet", async () => {
    const { t, claimedAt } = await claimed();
    expect(await next(t, Date.parse("2026-09-18T00:10:00Z"))).toBe(claimedAt + DAY + 1);
  });

  it("never answers a moment already passed", async () => {
    const { t, claimedAt } = await claimed();
    // At the quiet moment itself, quiet is no longer ahead, and silent is a day off: the
    // next midnight comes first.
    expect(await next(t, claimedAt + HOUR + 1)).toBe(MIDNIGHT);
  });

  it("is a blocker's nudge date", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seed({ issues: ["a"] });
    const nudgeAt = Date.parse("2026-09-17T15:00:00Z");
    await raise(t, "cn-1", { nudgeAt });
    expect(await next(t, Date.now())).toBe(nudgeAt);
  });

  it("is a close leaving the brief's recent list, or the midnight before it", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seed({ issues: ["a"] });
    await closeIssue(t, "cn-1");
    const closedAt = (await rawIssue(t, "cn-1")).closedAt!;
    const now = closedAt + 1;
    expect(await next(t, now)).toBe(
      Math.min(Math.ceil(fadedAt(closedAt)), (Math.floor(now / DAY) + 1) * DAY),
    );
    // Past the next midnight, the faded moment is the one ahead.
    expect(await next(t, MIDNIGHT + DAY + 1)).toBe(Math.ceil(fadedAt(closedAt)));
  });

  it("is an inbox item turning stale", async () => {
    at("2026-09-17T09:00:00Z");
    const t = await seed();
    // A P3, which is never stuck, so the stale moment is the only one it has.
    await t.mutation(api.issues.create, {
      actor,
      project: "cn",
      epic: "ep-0",
      title: "stray",
      priority: 3,
    });
    const createdAt = (await rawIssue(t, "cn-1"))._creationTime;
    expect(await next(t, Date.parse("2026-09-24T01:00:00Z"))).toBe(
      Math.ceil(createdAt + 7 * DAY + 1),
    );
  });
});

describe("a line crossed while the page is open", () => {
  it("appears on the brief at the moment clock.next answers, with no write", async () => {
    const { t, claimedAt } = await claimed();
    const now = Date.parse("2026-09-18T00:10:00Z");
    expect((await t.query(api.brief.get, { actor, now })).inProgress[0]).not.toHaveProperty(
      "silentSince",
    );
    const moment = await next(t, now);
    expect(
      (await t.query(api.brief.get, { actor, now: moment - 1 })).inProgress[0],
    ).not.toHaveProperty("silentSince");
    expect((await t.query(api.brief.get, { actor, now: moment })).inProgress[0]).toMatchObject({
      silentSince: claimedAt,
    });
  });

  it("appears on the issue's own page at the moment clock.next answers, with no write", async () => {
    const { t } = await stale();
    const now = Date.parse("2026-09-18T01:00:00Z");
    expect(await t.query(api.show.get, { id: "cn-1", now })).toMatchObject({ stuck: false });
    const moment = await next(t, now);
    expect(await t.query(api.show.get, { id: "cn-1", now: moment - 1 })).toMatchObject({
      stuck: false,
    });
    expect(await t.query(api.show.get, { id: "cn-1", now: moment })).toMatchObject({
      stuck: true,
    });
  });
});
