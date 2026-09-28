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
