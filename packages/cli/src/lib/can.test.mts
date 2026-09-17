import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { can } from "./can.mts";

function tempConfig(body: unknown): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), "cairn-can-"));
  mkdirSync(join(home, "cairn"));
  writeFileSync(join(home, "cairn", "config.json"), JSON.stringify(body));
  return { XDG_CONFIG_HOME: home };
}

const noConfig = (): NodeJS.ProcessEnv => ({
  XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "cairn-none-")),
});

describe("can", () => {
  it("prefers the flag over everything", () => {
    const env = { ...tempConfig({ can: ["web"], deployments: {} }), CAIRN_CAN: "android" };
    expect(can(["ios"], env)).toEqual(["ios"]);
  });

  it("reads a bare --can as nothing, not as absent", () => {
    const env = { ...tempConfig({ can: ["web"], deployments: {} }), CAIRN_CAN: "android" };
    expect(can([], env)).toEqual([]);
  });

  it("takes CAIRN_CAN next, split on commas and whitespace", () => {
    const env = { ...tempConfig({ can: ["web"], deployments: {} }), CAIRN_CAN: "ios, android web" };
    expect(can(undefined, env)).toEqual(["ios", "android", "web"]);
  });

  it("reads an empty CAIRN_CAN as nothing, and does not fall through to the file", () => {
    const env = { ...tempConfig({ can: ["web"], deployments: {} }), CAIRN_CAN: "" };
    expect(can(undefined, env)).toEqual([]);
  });

  it("falls back to what the machine declares in its config", () => {
    expect(can(undefined, tempConfig({ can: ["web", "android"], deployments: {} }))).toEqual([
      "web",
      "android",
    ]);
  });

  it("is nothing with no flag, no environment and no file", () => {
    expect(can(undefined, noConfig())).toEqual([]);
  });
});
