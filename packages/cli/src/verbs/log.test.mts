import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./log.mts";

describe("cn log", () => {
  it("sends no limit it was not given, so the deployment's default holds; no before, json off", () => {
    expect(parse([])).toEqual({ action: "log", json: false });
  });

  it("takes --limit and --json", () => {
    expect(parse(["--limit", "5", "--json"])).toEqual({
      action: "log",
      limit: 5,
      json: true,
    });
  });

  it("parses --before as anything Date.parse takes", () => {
    expect(parse(["--before", "2026-09-01"])).toEqual({
      action: "log",
      before: Date.parse("2026-09-01"),
      json: false,
    });
  });

  it("is help when asked for it, and refuses a positional", () => {
    expect(parse(["--help"])).toEqual({ action: "help" });
    expect(() => parse(["cn-1"])).toThrow(UsageError);
  });

  it("refuses a limit that is not a whole number from 1 to 200", () => {
    for (const limit of ["0", "201", "1.5", "many"])
      expect(() => parse(["--limit", limit])).toThrow(UsageError);
  });

  it("refuses a before that Date.parse cannot read", () => {
    expect(() => parse(["--before", "someday"])).toThrow(UsageError);
  });
});
