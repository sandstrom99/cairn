import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./release.mts";

describe("cn release", () => {
  it("takes one id", () => {
    expect(parse(["cn-2"])).toEqual({ action: "release", args: { id: "cn-2" } });
  });

  it("refuses no id and more than one", () => {
    expect(() => parse([])).toThrow(UsageError);
    expect(() => parse(["cn-1", "cn-2"])).toThrow(UsageError);
  });
});
