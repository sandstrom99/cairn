import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./brief.mts";

describe("cn brief", () => {
  it("asks with whatever the environment and config say", () => {
    expect(parse([])).toEqual({ action: "brief", json: false, can: undefined, unjournaled: false });
  });

  it("takes the capabilities the session declares", () => {
    expect(parse(["--can", "ios", "web", "--json"])).toEqual({
      action: "brief",
      json: true,
      can: ["ios", "web"],
      unjournaled: false,
    });
  });

  it("reads a bare --can as nothing, not as absent", () => {
    expect(parse(["--can"])).toEqual({ action: "brief", json: false, can: [], unjournaled: false });
  });

  it("narrows to what this session holds unjournaled, for the Stop hook", () => {
    expect(parse(["--unjournaled"])).toEqual({
      action: "brief",
      json: false,
      can: undefined,
      unjournaled: true,
    });
    expect(parse(["--unjournaled", "--json"])).toEqual({
      action: "brief",
      json: true,
      can: undefined,
      unjournaled: true,
    });
  });

  it("refuses a positional, which is a flag the caller forgot to name", () => {
    expect(() => parse(["ios"])).toThrow(UsageError);
    expect(() => parse(["ios"])).toThrow(/takes flags only, and got "ios"/);
  });
});
