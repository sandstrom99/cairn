import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.mts";
import { UsageError } from "./cli.mts";

describe("parseArgs", () => {
  it("separates positionals from flags", () => {
    const r = parseArgs(["app-14", "--json"], { bool: ["json"] });
    expect(r).toEqual({ pos: ["app-14"], opts: { json: true } });
  });

  it("takes a value as --x y or --x=y, last one wins", () => {
    const r = parseArgs(["--epic", "e-1", "--epic=e-2"], { value: ["epic"] });
    expect(r.opts.epic).toBe("e-2");
  });

  it("turns a bool off with --x=no", () => {
    expect(parseArgs(["--json=no"], { bool: ["json"] }).opts.json).toBe(false);
  });

  it("swallows positionals into a list flag until the next flag", () => {
    const r = parseArgs(["--requires", "ios", "device", "--json"], {
      list: ["requires"],
      bool: ["json"],
    });
    expect(r.opts.requires).toEqual(["ios", "device"]);
    expect(r.opts.json).toBe(true);
  });

  it("ends the flags at --", () => {
    const r = parseArgs(["--", "--not-a-flag"], {});
    expect(r.pos).toEqual(["--not-a-flag"]);
  });

  it("rejects an unknown flag with a UsageError", () => {
    expect(() => parseArgs(["--nope"], {})).toThrow(UsageError);
  });

  it("rejects a value flag with no value", () => {
    expect(() => parseArgs(["--epic"], { value: ["epic"] })).toThrow(/takes a value/);
  });
});
