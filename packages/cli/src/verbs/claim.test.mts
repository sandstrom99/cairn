import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./claim.mts";

describe("cn claim", () => {
  it("takes one id", () => {
    expect(parse(["cn-2"])).toEqual({ action: "claim", args: { id: "cn-2" } });
  });

  it("refuses no id and more than one", () => {
    expect(() => parse([])).toThrow(UsageError);
    expect(() => parse(["cn-1", "cn-2"])).toThrow(UsageError);
  });
});
