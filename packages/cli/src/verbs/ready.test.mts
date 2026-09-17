import { describe, expect, it } from "vitest";
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

  it("prints its header for --help", () => {
    expect(parse(["--help"])).toEqual({ action: "help" });
  });
});
