import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./journal.mts";

describe("cn journal", () => {
  it("takes the rest of the line as the body, so an entry needs no quoting", () => {
    expect(
      parse(["cn-2", "--kind", "finding", "claim", "works,", "closing", "with", "evidence"]),
    ).toEqual({
      action: "journal",
      args: { id: "cn-2", kind: "finding", body: "claim works, closing with evidence" },
    });
  });

  it("takes a quoted body too", () => {
    expect(parse(["cn-2", "--kind", "handoff", "where this stands"])).toEqual({
      action: "journal",
      args: { id: "cn-2", kind: "handoff", body: "where this stands" },
    });
  });

  it("needs an id, a kind that exists, and a body", () => {
    expect(() => parse(["--kind", "finding", "body"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "body"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--kind", "note", "body"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--kind", "finding"])).toThrow(UsageError);
  });
});
