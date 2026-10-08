import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { tempHome } from "../lib/testing.mts";
import { parse } from "./epic.mts";

describe("cn epic", () => {
  it("parses new with a title and a description", () => {
    expect(parse(["new", "Create to close", "--description", "the loop"])).toEqual({
      action: "new",
      args: { title: "Create to close", description: "the loop" },
    });
  });

  it("parses new with a link, as cn create takes one", () => {
    expect(parse(["new", "t", "--link", "[plan](https://example.com/p)"])).toEqual({
      action: "new",
      args: { title: "t", link: [{ url: "https://example.com/p", label: "plan" }] },
    });
  });

  it("parses new as an outcome with --done-when, or a stream with --stream", () => {
    expect(parse(["new", "Ship invite links", "--done-when", "a link opens the app"])).toEqual({
      action: "new",
      args: { title: "Ship invite links", doneWhen: "a link opens the app" },
    });
    expect(parse(["new", "Scout findings", "--stream"])).toEqual({
      action: "new",
      args: { title: "Scout findings", type: "stream" },
    });
    // Both, or neither, is the deployment's to refuse: it holds the rule.
    expect(parse(["new", "t", "--stream", "--done-when", "x"]).args).toEqual({
      title: "t",
      type: "stream",
      doneWhen: "x",
    });
  });

  it("takes an unquoted title as one title", () => {
    expect(parse(["new", "Create", "to", "close"])).toEqual({
      action: "new",
      args: { title: "Create to close" },
    });
  });

  it("parses list, --all and --json", () => {
    expect(parse(["list"])).toEqual({ action: "list", json: false, args: {} });
    expect(parse(["list", "--all", "--json"])).toEqual({
      action: "list",
      json: true,
      args: { all: true },
    });
  });

  it("parses close, and close --drop with its reason", () => {
    expect(parse(["close", "ep-1", "--revision", "0"])).toEqual({
      action: "close",
      args: { id: "ep-1", revision: 0 },
    });
    expect(
      parse(["close", "ep-1", "--revision", "2", "--drop", "--reason", "not shipping"]),
    ).toEqual({
      action: "close",
      args: { id: "ep-1", revision: 2, drop: true, reason: "not shipping" },
    });
  });

  it("refuses a close with no revision, a revision that is not one, and a reason without --drop", () => {
    expect(() => parse(["close", "ep-1"])).toThrow(UsageError);
    expect(() => parse(["close", "ep-1", "--revision", "later"])).toThrow(UsageError);
    expect(() => parse(["close", "--revision", "0"])).toThrow(UsageError);
    expect(() => parse(["close", "ep-1", "--revision", "0", "--reason", "why"])).toThrow(
      UsageError,
    );
  });

  it("parses close --carry-to, and refuses it beside --drop", () => {
    expect(parse(["close", "ep-1", "--revision", "3", "--carry-to", "ep-4"])).toEqual({
      action: "close",
      args: { id: "ep-1", revision: 3, carryTo: "ep-4" },
    });
    expect(() =>
      parse(["close", "ep-1", "--revision", "0", "--drop", "--reason", "x", "--carry-to", "ep-4"]),
    ).toThrow(/--carry-to goes with a close, not --drop; a drop takes the work with it/);
  });

  it("refuses a drop with no reason, or a blank one, before the deployment sees it", () => {
    expect(() => parse(["close", "ep-1", "--revision", "0", "--drop"])).toThrow(/why not/);
    expect(() => parse(["close", "ep-1", "--revision", "0", "--drop", "--reason", "  "])).toThrow(
      UsageError,
    );
  });

  it("refuses new with no title, an action it does not have, and a positional after list", () => {
    expect(() => parse(["new"])).toThrow(UsageError);
    expect(() => parse(["drop", "ep-1"])).toThrow(UsageError);
    expect(() => parse(["list", "ep-1"])).toThrow(UsageError);
  });

  /** A real file holding a two-line Markdown body, gone after the test. */
  const notes = (): string => {
    const path = join(tempHome("cairn-text-"), "notes.md");
    writeFileSync(path, "# design\n\n- one\n");
    return path;
  };

  it("reads new's description from the file an @ value names, and refuses a missing one", () => {
    expect(parse(["new", "Create to close", "--description", `@${notes()}`])).toEqual({
      action: "new",
      args: { title: "Create to close", description: "# design\n\n- one\n" },
    });
    expect(() => parse(["new", "Create to close", "--description", "@missing.md"])).toThrow(
      UsageError,
    );
  });
});
