import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./ack.mts";

describe("cn ack", () => {
  it("takes one blocker id", () => {
    expect(parse(["bl-1"])).toEqual({ action: "ack", args: { id: "bl-1" } });
  });

  it("passes the person's words trimmed, and leaves them out when there are none", () => {
    expect(parse(["bl-1", "--said", "  seen it  "])).toEqual({
      action: "ack",
      args: { id: "bl-1", said: "seen it" },
    });
    expect(parse(["bl-1", "--said", "   "])).toEqual({ action: "ack", args: { id: "bl-1" } });
  });

  it("needs exactly one", () => {
    expect(() => parse([])).toThrow(UsageError);
    expect(() => parse(["bl-1", "bl-2"])).toThrow(UsageError);
  });
});
