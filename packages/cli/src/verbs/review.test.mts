import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./review.mts";

describe("cn review", () => {
  it("takes one epic", () => {
    expect(parse(["ep-3"])).toEqual({ action: "review", id: "ep-3", json: false });
  });

  it("carries --json", () => {
    expect(parse(["ep-0", "--json"])).toEqual({ action: "review", id: "ep-0", json: true });
  });

  it("refuses anything that is not an epic id, no id, and a second one", () => {
    expect(() => parse(["cn-7"])).toThrow(UsageError);
    expect(() => parse([])).toThrow(UsageError);
    expect(() => parse(["ep-1", "ep-2"])).toThrow(UsageError);
  });
});
