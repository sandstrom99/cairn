import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./dep.mts";

describe("cn dep", () => {
  it("writes the same row whichever way round it is asked for", () => {
    const blockedBy = parse(["add", "cn-2", "--blocked-by", "cn-1"]);
    expect(blockedBy).toEqual({
      action: "add",
      args: { from: "cn-1", to: "cn-2", type: "blocks" },
    });
    expect(parse(["add", "cn-1", "--blocks", "cn-2"])).toEqual(blockedBy);
  });

  it("sends the other relations from the named issue outward", () => {
    for (const type of ["related", "discovered-from", "duplicates", "supersedes"] as const)
      expect(parse(["add", "cn-1", `--${type}`, "cn-2"])).toEqual({
        action: "add",
        args: { from: "cn-1", to: "cn-2", type },
      });
  });

  it("removes with the same arguments it added with", () => {
    expect(parse(["rm", "cn-2", "--blocked-by", "cn-1"])).toEqual({
      action: "rm",
      args: { from: "cn-1", to: "cn-2", type: "blocks" },
    });
  });

  it("needs exactly one relation", () => {
    expect(() => parse(["add", "cn-1"])).toThrow(UsageError);
    expect(() => parse(["add", "cn-1", "--blocks", "cn-2", "--related", "cn-3"])).toThrow(
      UsageError,
    );
  });

  it("needs add or rm, and one id beside the relation", () => {
    expect(() => parse(["link", "cn-1", "--blocks", "cn-2"])).toThrow(UsageError);
    expect(() => parse(["add", "--blocks", "cn-2"])).toThrow(UsageError);
    expect(() => parse(["add", "cn-1", "cn-3", "--blocks", "cn-2"])).toThrow(UsageError);
  });
});
