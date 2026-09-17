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

  it("refuses new with no title, and an action it does not have", () => {
    expect(() => parse(["new"])).toThrow(UsageError);
    expect(() => parse(["drop", "ep-1"])).toThrow(UsageError);
  });
});
