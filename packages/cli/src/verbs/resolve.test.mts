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

  it("passes the person's words trimmed, and leaves them out when there are none", () => {
    expect(parse(["bl-1", "--note", "signed", "--said", "  it is signed, go ahead  "])).toEqual({
      action: "resolve",
      args: { id: "bl-1", note: "signed", said: "it is signed, go ahead" },
    });
    expect(parse(["bl-1", "--note", "signed", "--said", " "])).toEqual({
      action: "resolve",
      args: { id: "bl-1", note: "signed" },
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
