import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./project.mts";

describe("cn project", () => {
  it("parses new with its name", () => {
    expect(parse(["new", "cn", "--name", "cairn: backend, cli, plugin"])).toEqual({
      action: "new",
      args: { slug: "cn", name: "cairn: backend, cli, plugin" },
    });
  });

  it("parses list, with and without --json", () => {
    expect(parse(["list"])).toEqual({ action: "list", json: false });
    expect(parse(["list", "--json"])).toEqual({ action: "list", json: true });
  });

  it("refuses new with no slug or no name", () => {
    expect(() => parse(["new", "--name", "x"])).toThrow(UsageError);
    expect(() => parse(["new", "cn"])).toThrow(UsageError);
  });

  it("refuses an action it does not have", () => {
    expect(() => parse(["rename", "cn"])).toThrow(UsageError);
    expect(() => parse([])).toThrow(UsageError);
  });

  it("answers help before anything else", () => {
    expect(parse(["--help"])).toEqual({ action: "help" });
  });
});
