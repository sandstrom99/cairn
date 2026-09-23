import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./ready.mts";

describe("cn ready", () => {
  it("asks for everything when nothing was given", () => {
    expect(parse([])).toEqual({ action: "ready", json: false, can: undefined });
  });

  it("takes the capabilities the session declares", () => {
    expect(parse(["--can", "ios", "web", "--json"])).toEqual({
      action: "ready",
      json: true,
      can: ["ios", "web"],
    });
  });

  it("reads a bare --can as nothing, not as absent", () => {
    expect(parse(["--can"])).toEqual({ action: "ready", json: false, can: [] });
  });

  it("refuses a positional rather than run past it: cn ready ios is not cn ready", () => {
    expect(() => parse(["ios"])).toThrow(UsageError);
    expect(() => parse(["--can", "web", "--json", "ios"])).toThrow(/got "ios"/);
  });
});
