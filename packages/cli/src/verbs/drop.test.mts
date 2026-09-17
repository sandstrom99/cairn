import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./drop.mts";

describe("cn drop", () => {
  it("takes an id, the revision and the reason", () => {
    expect(parse(["x-3", "--revision", "0", "--reason", "throwaway from slice 1"])).toEqual({
      action: "drop",
      args: { id: "x-3", revision: 0, reason: "throwaway from slice 1" },
    });
  });

  it("needs a reason, and a blank one is no reason", () => {
    expect(() => parse(["x-3", "--revision", "0"])).toThrow(UsageError);
    expect(() => parse(["x-3", "--revision", "0", "--reason", "   "])).toThrow(UsageError);
  });

  it("needs a revision, and an integer one", () => {
    expect(() => parse(["x-3", "--reason", "no"])).toThrow(UsageError);
    expect(() => parse(["x-3", "--revision", "one", "--reason", "no"])).toThrow(UsageError);
  });
});
