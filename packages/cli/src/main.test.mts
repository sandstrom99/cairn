import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageError } from "./lib/cli.mts";
import { cn } from "./main.mts";

describe("cn", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists the verbs with no arguments", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await cn([])).toBe(0);
    expect(log.mock.calls[0]?.[0]).toMatch(/usage: cn <verb>/);
    expect(log.mock.calls[0]?.[0]).toMatch(/doctor/);
  });

  it("prints the version in package.json, as it is", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await cn(["--version"])).toBe(0);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(log.mock.calls[0]?.[0]).toBe(pkg.version);
  });

  it("rejects an unknown verb as a usage error", async () => {
    await expect(cn(["frobnicate"])).rejects.toThrow(UsageError);
  });
});
