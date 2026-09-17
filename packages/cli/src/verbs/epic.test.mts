import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./epic.mts";

describe("cn epic", () => {
  it("parses new with a title and a description", () => {
    expect(parse(["new", "Create to close", "--description", "the loop"])).toEqual({
      action: "new",
      args: { title: "Create to close", description: "the loop" },
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

  it("refuses new with no title, and an action it does not have", () => {
    expect(() => parse(["new"])).toThrow(UsageError);
    expect(() => parse(["close", "ep-1"])).toThrow(UsageError);
  });
});
