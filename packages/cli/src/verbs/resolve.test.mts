import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./resolve.mts";

describe("cn resolve", () => {
  it("takes a blocker id and the note that is the record", () => {
    expect(parse(["bl-1", "--note", "accepted in App Store Connect"])).toEqual({
      action: "resolve",
      args: { id: "bl-1", note: "accepted in App Store Connect" },
    });
  });

  it("refuses a note that says nothing", () => {
    expect(() => parse(["bl-1"])).toThrow(UsageError);
    expect(() => parse(["bl-1", "--note", "   "])).toThrow(UsageError);
  });

  it("needs exactly one blocker id", () => {
    expect(() => parse(["--note", "done"])).toThrow(UsageError);
    expect(() => parse(["bl-1", "bl-2", "--note", "done"])).toThrow(UsageError);
  });
});
