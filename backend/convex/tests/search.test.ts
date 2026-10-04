// A search has two rules, case aside: a title or a link's URL or label holds the text as one
// substring, and a description or journal body holds every word of it, each found from its
// start. Each case below is a way it could quietly answer less than the list holds, or more:
// a field it forgot to read, a case it did not fold, a word it let go missing, an order that
// disagrees with `cn list`, or a filter that let the wrong status through.
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { type Harness, actor, seed } from "./test.fixtures";

/** An issue in `cn`/`ep-1` with a description, which `seed` does not set. */
const described = (t: Harness, title: string, description: string) =>
  t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title, description });

/** A finding on an issue, the one journal kind these cases need. */
const finding = (t: Harness, id: string, body: string) =>
  t.mutation(api.journal.append, { actor, id, kind: "finding", body });

/** Each hit as its id and the field it was found in. */
const find = async (t: Harness, args: { text: string; project?: string; status?: "open" }) =>
  (await t.query(api.search.find, args)).map(({ id, matched }) => ({ id, matched }));

describe("search.find", () => {
  it("finds by title, by description and by a journal body alone, naming the field", async () => {
    const t = await seed({ issues: ["fix connection retry"] });
    await described(t, "the socket layer", "a retry loop with no backoff");
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "logs" });
    await finding(t, "cn-3", "the retry storm shows here first");

    expect(await find(t, { text: "retry" })).toEqual([
      { id: "cn-1", matched: "title" },
      { id: "cn-2", matched: "description" },
      { id: "cn-3", matched: "journal" },
    ]);
    const [hit] = await t.query(api.search.find, { text: "socket" });
    expect(hit).toMatchObject({ id: "cn-2", title: "the socket layer", matched: "title" });
  });

  it("finds by a link's URL or its label, and reads title first and links before journal", async () => {
    const t = await seed({ issues: ["the socket layer", "retry the push", "logs"] });
    const link = (id: string, url: string, label?: string) =>
      t.mutation(api.issues.update, {
        actor,
        id,
        revision: 0,
        link: [{ url, ...(label === undefined ? {} : { label }) }],
      });
    await link("cn-1", "https://example.com/retry-design");
    await link("cn-2", "https://example.com/pr/7", "the retry pull");
    await link("cn-3", "https://example.com/logs", "Retry dashboard");
    await finding(t, "cn-3", "retry shows here too");

    expect(await find(t, { text: "retry" })).toEqual([
      { id: "cn-1", matched: "links" },
      { id: "cn-2", matched: "title" },
      { id: "cn-3", matched: "links" },
    ]);
    expect(await find(t, { text: "example.com/pr" })).toEqual([{ id: "cn-2", matched: "links" }]);
  });

  it("reports the first field that holds the text", async () => {
    const t = await seed({ issues: ["retry the push"] });
    await finding(t, "cn-1", "retry fixed it");
    expect(await find(t, { text: "retry" })).toEqual([{ id: "cn-1", matched: "title" }]);
  });

  it("matches case aside", async () => {
    const t = await seed({ issues: ["the counter"] });
    await finding(t, "cn-1", "a finding about the counter row");
    expect(await find(t, { text: "FINDING" })).toEqual([{ id: "cn-1", matched: "journal" }]);
    expect(await find(t, { text: "  Counter " })).toEqual([{ id: "cn-1", matched: "title" }]);
  });

  it("orders hits by priority then age, as the list does", async () => {
    const t = await seed({
      issues: ["scratch one", "scratch two", { title: "scratch urgent", priority: 1 }],
    });
    expect((await find(t, { text: "scratch" })).map((h) => h.id)).toEqual(["cn-3", "cn-1", "cn-2"]);
  });

  it("narrows by project and status, and refuses an unknown project as the list does", async () => {
    const t = await seed({ issues: ["scratch one", "scratch two"] });
    await t.mutation(api.projects.create, { actor, slug: "x", name: "the other one" });
    await t.mutation(api.issues.create, {
      actor,
      project: "x",
      epic: "ep-1",
      title: "scratch elsewhere",
    });
    await t.mutation(api.issues.claim, { actor, id: "cn-1" });

    expect((await find(t, { text: "scratch" })).map((h) => h.id)).toEqual(["cn-1", "cn-2", "x-1"]);
    expect((await find(t, { text: "scratch", project: "x" })).map((h) => h.id)).toEqual(["x-1"]);
    expect((await find(t, { text: "scratch", status: "open" })).map((h) => h.id)).toEqual([
      "cn-2",
      "x-1",
    ]);
    expect(
      (await find(t, { text: "scratch", project: "cn", status: "open" })).map((h) => h.id),
    ).toEqual(["cn-2"]);
    await expect(t.query(api.search.find, { text: "scratch", project: "nope" })).rejects.toThrow(
      /no such project nope/,
    );
    await expect(t.query(api.issues.list, { project: "nope" })).rejects.toThrow(
      /no such project nope/,
    );
  });

  it("matches a title by any substring, and a description or journal entry only from the start of a word", async () => {
    const t = await seed({ issues: ["fix connection retry"] });
    await described(t, "the socket layer", "a retry loop with no backoff");
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "logs" });
    await finding(t, "cn-3", "the retry storm");

    expect(await find(t, { text: "etry" })).toEqual([{ id: "cn-1", matched: "title" }]);
    expect(await find(t, { text: "retr" })).toEqual([
      { id: "cn-1", matched: "title" },
      { id: "cn-2", matched: "description" },
      { id: "cn-3", matched: "journal" },
    ]);
  });

  it("requires every word in a description or a journal entry, in any order", async () => {
    const t = await seed();
    await described(t, "the socket layer", "a retry loop with no backoff");
    await t.mutation(api.issues.create, { actor, project: "cn", epic: "ep-1", title: "logs" });
    await finding(t, "cn-2", "the push loop with no timeout");

    expect(await find(t, { text: "backoff retry" })).toEqual([
      { id: "cn-1", matched: "description" },
    ]);
    expect(await find(t, { text: "retry missing" })).toEqual([]);
    expect(await find(t, { text: "etry loop" })).toEqual([]);
    expect(await find(t, { text: "timeout push" })).toEqual([{ id: "cn-2", matched: "journal" }]);
    expect(await find(t, { text: "push missing" })).toEqual([]);
  });

  it("holds a title to the whole text", async () => {
    const t = await seed({ issues: ["fix connection retry"] });
    expect(await find(t, { text: "retry connection" })).toEqual([]);
  });

  it("answers nothing for an empty text, whitespace, or a text nothing holds", async () => {
    const t = await seed({ issues: ["scratch one"] });
    await finding(t, "cn-1", "a finding");
    expect(await t.query(api.search.find, { text: "" })).toEqual([]);
    expect(await t.query(api.search.find, { text: "   " })).toEqual([]);
    expect(await t.query(api.search.find, { text: "nothing-like-this" })).toEqual([]);
  });
});
