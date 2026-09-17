import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./show.mts";

describe("cn show", () => {
  it("takes one id, and --json", () => {
    expect(parse(["cn-1"])).toEqual({ action: "show", json: false, args: { id: "cn-1" } });
    expect(parse(["ep-1", "--json"])).toEqual({
      action: "show",
      json: true,
      args: { id: "ep-1" },
    });
  });

  it("asks for the events with --history", () => {
    expect(parse(["cn-2", "--history"])).toEqual({
      action: "show",
      json: false,
      args: { id: "cn-2", history: true },
    });
  });

  it("refuses no id and more than one", () => {
    expect(() => parse([])).toThrow(UsageError);
    expect(() => parse(["cn-1", "cn-2"])).toThrow(UsageError);
  });
});
