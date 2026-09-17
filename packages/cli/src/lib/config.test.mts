import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configPath, resolveDeployment } from "./config.mts";

function tempConfig(body: unknown): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), "cairn-config-"));
  mkdirSync(join(home, "cairn"));
  writeFileSync(join(home, "cairn", "config.json"), JSON.stringify(body));
  return { XDG_CONFIG_HOME: home };
}

describe("resolveDeployment", () => {
  it("prefers CAIRN_URL over any file", () => {
    const env = {
      ...tempConfig({ deployments: { a: { url: "https://a" } } }),
      CAIRN_URL: "https://env",
    };
    expect(resolveDeployment(env)).toEqual({
      name: "CAIRN_URL",
      url: "https://env",
      source: "env",
    });
  });

  it("uses the default deployment from the file", () => {
    const env = tempConfig({
      default: "b",
      deployments: { a: { url: "https://a" }, b: { url: "https://b" } },
    });
    expect(resolveDeployment(env)).toEqual({ name: "b", url: "https://b", source: "config" });
  });

  it("uses the only deployment when there is one and no default", () => {
    const env = tempConfig({ deployments: { a: { url: "https://a" } } });
    expect(resolveDeployment(env)?.name).toBe("a");
  });

  it("answers null with two deployments and no default", () => {
    const env = tempConfig({ deployments: { a: { url: "https://a" }, b: { url: "https://b" } } });
    expect(resolveDeployment(env)).toBeNull();
  });

  it("answers null with no file at all", () => {
    const home = mkdtempSync(join(tmpdir(), "cairn-empty-"));
    expect(resolveDeployment({ XDG_CONFIG_HOME: home })).toBeNull();
  });

  it("carries the secret from the file, with its source", () => {
    const env = tempConfig({ deployments: { a: { url: "https://a", secret: "from-file" } } });
    expect(resolveDeployment(env)).toEqual({
      name: "a",
      url: "https://a",
      source: "config",
      secret: "from-file",
      secretSource: "config",
    });
  });

  it("lets CAIRN_SECRET override the file's secret", () => {
    const env = {
      ...tempConfig({ deployments: { a: { url: "https://a", secret: "from-file" } } }),
      CAIRN_SECRET: "from-shell",
    };
    expect(resolveDeployment(env)).toMatchObject({
      url: "https://a",
      secret: "from-shell",
      secretSource: "env",
    });
  });

  it("carries CAIRN_SECRET alongside CAIRN_URL", () => {
    expect(resolveDeployment({ CAIRN_URL: "https://env", CAIRN_SECRET: "s" })).toEqual({
      name: "CAIRN_URL",
      url: "https://env",
      source: "env",
      secret: "s",
      secretSource: "env",
    });
  });

  it("carries no secret when neither the file nor the shell has one", () => {
    const dep = resolveDeployment({ CAIRN_URL: "https://env" });
    expect(dep?.secret).toBeUndefined();
    expect(dep?.secretSource).toBeUndefined();
  });

  it("honours XDG_CONFIG_HOME in the path", () => {
    expect(configPath({ XDG_CONFIG_HOME: "/x" })).toBe("/x/cairn/config.json");
  });
});
