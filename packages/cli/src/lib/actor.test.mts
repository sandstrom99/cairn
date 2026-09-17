import { describe, expect, it } from "vitest";
import { actor } from "./actor.mts";

const sys = { hostname: () => "wsl", username: () => "balder" };

describe("actor", () => {
  it("is the user on this host, as a human", () => {
    expect(actor({}, sys)).toEqual({ name: "wsl/balder", kind: "human" });
  });

  it("is claude on this host when CLAUDECODE is set", () => {
    expect(actor({ CLAUDECODE: "1" }, sys)).toEqual({ name: "wsl/claude", kind: "agent" });
  });

  it("takes the host from CAIRN_HOST", () => {
    expect(actor({ CAIRN_HOST: "runner" }, sys).name).toBe("runner/balder");
  });

  it("lets CAIRN_ACTOR win outright, keeping the kind", () => {
    expect(actor({ CAIRN_ACTOR: "ci", CLAUDECODE: "1" }, sys)).toEqual({
      name: "ci",
      kind: "agent",
    });
  });
});
