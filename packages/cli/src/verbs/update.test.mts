import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./update.mts";

describe("cn update", () => {
  it("sends the id, the revision and only the fields that were given", () => {
    expect(parse(["cn-2", "--revision", "1", "--priority", "1"])).toEqual({
      action: "update",
      args: { id: "cn-2", revision: 1, priority: 1 },
    });
  });

  it("parses the whole contract", () => {
    expect(
      parse([
        "cn-2",
        "--revision",
        "3",
        "--title",
        "the lifecycle",
        "--description",
        "claim to close",
        "--design",
        "one mutation per verb",
        "--acceptance",
        "two claims, one wins",
        "--priority",
        "0",
        "--epic",
        "ep-2",
        "--defer-until",
        "2026-10-01",
        "--requires",
        "ios",
        "device",
      ]),
    ).toEqual({
      action: "update",
      args: {
        id: "cn-2",
        revision: 3,
        title: "the lifecycle",
        description: "claim to close",
        design: "one mutation per verb",
        acceptance: "two claims, one wins",
        priority: 0,
        epic: "ep-2",
        deferUntil: Date.parse("2026-10-01"),
        requires: ["ios", "device"],
      },
    });
  });

  it("clears a date and a capability list with none, which absent does not", () => {
    expect(parse(["cn-2", "--revision", "0", "--defer-until", "none"])).toEqual({
      action: "update",
      args: { id: "cn-2", revision: 0, deferUntil: null },
    });
    expect(parse(["cn-2", "--revision", "0", "--requires", "none"])).toEqual({
      action: "update",
      args: { id: "cn-2", revision: 0, requires: [] },
    });
  });

  it("needs an integer revision and at least one field to change", () => {
    expect(() => parse(["cn-2", "--priority", "1"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--revision", "later", "--priority", "1"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--revision", "1"])).toThrow(UsageError);
  });

  it("refuses a date it cannot read and a priority that is not a number", () => {
    expect(() => parse(["cn-2", "--revision", "1", "--defer-until", "soon"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--revision", "1", "--priority", "high"])).toThrow(UsageError);
  });
});
