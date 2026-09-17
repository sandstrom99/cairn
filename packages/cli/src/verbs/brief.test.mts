import { describe, expect, it } from "vitest";
import { parse } from "./brief.mts";

describe("cn brief", () => {
  it("asks with whatever the environment and config say", () => {
    expect(parse([])).toEqual({ action: "brief", json: false, can: undefined });
  });

  it("takes the capabilities the session declares", () => {
    expect(parse(["--can", "ios", "web", "--json"])).toEqual({
      action: "brief",
      json: true,
      can: ["ios", "web"],
    });
  });

  it("reads a bare --can as nothing, not as absent", () => {
    expect(parse(["--can"])).toEqual({ action: "brief", json: false, can: [] });
  });

  it("prints its header for --help", () => {
    expect(parse(["--help"])).toEqual({ action: "help" });
  });
});
