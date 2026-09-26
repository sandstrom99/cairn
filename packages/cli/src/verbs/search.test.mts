import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./search.mts";

describe("cn search", () => {
  it("passes the text and both filters through as the query's arguments", () => {
    expect(parse(["retry", "--project", "cn", "--status", "open"])).toEqual({
      action: "search",
      json: false,
      args: { text: "retry", project: "cn", status: "open" },
    });
  });

  it("joins several words with one space, so quoting changes nothing", () => {
    expect(parse(["connection", "retry"])).toEqual({
      action: "search",
      json: false,
      args: { text: "connection retry" },
    });
  });

  it("refuses no text, which would match everything", () => {
    expect(() => parse([])).toThrow(UsageError);
    expect(() => parse(["--json"])).toThrow(UsageError);
  });

  it("refuses a status that is not one of the four", () => {
    expect(() => parse(["retry", "--status", "blocked"])).toThrow(UsageError);
  });
});
