import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./waiting.mts";

describe("cn waiting", () => {
  it("takes --json and nothing else", () => {
    expect(parse([])).toEqual({ action: "waiting", json: false });
    expect(parse(["--json"])).toEqual({ action: "waiting", json: true });
  });

  it("refuses an argument", () => {
    expect(() => parse(["bl-1"])).toThrow(UsageError);
  });
});
