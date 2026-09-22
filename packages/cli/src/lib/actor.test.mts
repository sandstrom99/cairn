import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { actor } from "./actor.mts";

const sys = { hostname: () => "wsl", username: () => "balder" };

/** Every XDG_CONFIG_HOME a test makes, removed after it whatever it did. */
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempHome(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/**
 * An environment whose config home is empty. Every call below goes through one, because
 * `actor` reads the config for `host`, and with no XDG_CONFIG_HOME that would be this
 * machine's real file.
 */
const bare = (over: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  XDG_CONFIG_HOME: tempHome("cairn-actor-none-"),
  ...over,
});

/** An environment whose config sets `host`. */
function withHost(host: string, over: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const home = tempHome("cairn-actor-host-");
  mkdirSync(join(home, "cairn"));
  writeFileSync(join(home, "cairn", "config.json"), JSON.stringify({ host, deployments: {} }));
  return { XDG_CONFIG_HOME: home, ...over };
}

describe("actor", () => {
  it("is the user on this host, as a human", () => {
    expect(actor(bare(), sys)).toEqual({ name: "wsl/balder", kind: "human" });
  });

  it("is claude on this host when CLAUDECODE is set", () => {
    expect(actor(bare({ CLAUDECODE: "1" }), sys)).toEqual({ name: "wsl/claude", kind: "agent" });
  });

  it("takes the host from CAIRN_HOST", () => {
    expect(actor(bare({ CAIRN_HOST: "runner" }), sys).name).toBe("runner/balder");
  });

  it("takes the host from the config file, under CAIRN_HOST and over the machine's", () => {
    expect(actor(withHost("mac"), sys).name).toBe("mac/balder");
    expect(actor(withHost("mac", { CLAUDECODE: "1" }), sys).name).toBe("mac/claude");
    expect(actor(withHost("mac", { CAIRN_HOST: "runner" }), sys).name).toBe("runner/balder");
  });

  it("lets CAIRN_ACTOR win outright, keeping the kind", () => {
    expect(actor(bare({ CAIRN_ACTOR: "ci", CLAUDECODE: "1" }), sys)).toEqual({
      name: "ci",
      kind: "agent",
    });
  });

  it("carries the session beside the name, and the name does not change", () => {
    expect(actor(bare({ CLAUDECODE: "1", CAIRN_SESSION: "s-1" }), sys)).toEqual({
      name: "wsl/claude",
      kind: "agent",
      session: "s-1",
    });
  });

  it("sends no session key at all when CAIRN_SESSION is unset or empty", () => {
    expect(actor(bare({ CLAUDECODE: "1", CAIRN_SESSION: "" }), sys)).toEqual({
      name: "wsl/claude",
      kind: "agent",
    });
    expect("session" in actor(bare(), sys)).toBe(false);
  });
});
