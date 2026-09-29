import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./brief.mts";

describe("cn brief", () => {
  it("asks for the whole report, and takes --json", () => {
    expect(parse([])).toEqual({ action: "brief", json: false, unjournaled: false });
    expect(parse(["--json"])).toEqual({ action: "brief", json: true, unjournaled: false });
  });

  it("takes no capabilities", () => {
    expect(() => parse(["--can", "web"])).toThrow("unknown option --can");
  });

  it("narrows to what this session holds unjournaled, for the Stop hook", () => {
    expect(parse(["--unjournaled"])).toEqual({
      action: "brief",
      json: false,
      unjournaled: true,
    });
    expect(parse(["--unjournaled", "--json"])).toEqual({
      action: "brief",
      json: true,
      unjournaled: true,
    });
  });

  it("refuses a positional, which is a flag the caller forgot to name", () => {
    expect(() => parse(["ios"])).toThrow(UsageError);
    expect(() => parse(["ios"])).toThrow(/takes flags only, and got "ios"/);
  });
});
