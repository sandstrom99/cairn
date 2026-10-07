import { describe, expect, it } from "vitest";
import { actor, shortHost } from "./actor.mts";

const sys = { hostname: () => "wsl", username: () => "balder" };

/** A config that sets `host`; the file is read once elsewhere and handed in as this. */
const withHost = (host: string) => ({ host, deployments: {} });

describe("actor", () => {
  it("is the user on this host, as a human", () => {
    expect(actor({}, null, sys)).toEqual({ name: "wsl/balder", kind: "human" });
  });

  it("is claude on this host when CLAUDECODE is set", () => {
    expect(actor({ CLAUDECODE: "1" }, null, sys)).toEqual({ name: "wsl/claude", kind: "agent" });
  });

  it("cuts the OS hostname to its first label, lowercased", () => {
    const mac = { ...sys, hostname: () => "Harbors-Mac-mini.local" };
    expect(actor({ CLAUDECODE: "1" }, null, mac).name).toBe("harbors-mac-mini/claude");
    expect(shortHost("ip-10-0-0-1.ec2.internal")).toBe("ip-10-0-0-1");
    expect(shortHost("wsl")).toBe("wsl");
    expect(shortHost(".local")).toBe(".local");
  });

  it("takes a chosen host as given, never cut or lowercased", () => {
    const mac = { ...sys, hostname: () => "Harbors-Mac-mini.local" };
    expect(actor({ CAIRN_HOST: "Build.Box" }, null, mac).name).toBe("Build.Box/balder");
    expect(actor({}, withHost("Studio.Mac"), mac).name).toBe("Studio.Mac/balder");
  });

  it("takes the host from CAIRN_HOST", () => {
    expect(actor({ CAIRN_HOST: "runner" }, null, sys).name).toBe("runner/balder");
  });

  it("takes the host from the config, under CAIRN_HOST and over the machine's", () => {
    expect(actor({}, withHost("mac"), sys).name).toBe("mac/balder");
    expect(actor({ CLAUDECODE: "1" }, withHost("mac"), sys).name).toBe("mac/claude");
    expect(actor({ CAIRN_HOST: "runner" }, withHost("mac"), sys).name).toBe("runner/balder");
  });

  it("lets CAIRN_ACTOR win outright, keeping the kind", () => {
    expect(actor({ CAIRN_ACTOR: "ci", CLAUDECODE: "1" }, null, sys)).toEqual({
      name: "ci",
      kind: "agent",
    });
  });

  it("carries the session beside the name, and the name does not change", () => {
    expect(actor({ CLAUDECODE: "1", CAIRN_SESSION: "s-1" }, null, sys)).toEqual({
      name: "wsl/claude",
      kind: "agent",
      session: "s-1",
    });
  });

  it("sends no session key at all when CAIRN_SESSION is unset or empty", () => {
    expect(actor({ CLAUDECODE: "1", CAIRN_SESSION: "" }, null, sys)).toEqual({
      name: "wsl/claude",
      kind: "agent",
    });
    expect("session" in actor({}, null, sys)).toBe(false);
  });
});
