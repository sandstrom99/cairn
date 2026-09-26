// A search is one substring rule, case aside, over title, description and every journal
// body. Each case below is a way it could quietly answer less than the list holds: a field
// it forgot to read, a case it did not fold, an order that disagrees with `cn list`, or a
// filter that let the wrong status through.
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

  it("answers nothing for an empty text, whitespace, or a text nothing holds", async () => {
    const t = await seed({ issues: ["scratch one"] });
    await finding(t, "cn-1", "a finding");
    expect(await t.query(api.search.find, { text: "" })).toEqual([]);
    expect(await t.query(api.search.find, { text: "   " })).toEqual([]);
    expect(await t.query(api.search.find, { text: "nothing-like-this" })).toEqual([]);
  });
});
