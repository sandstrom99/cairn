import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageError } from "./lib/cli.mts";
import { cn, wantsHelp } from "./main.mts";

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

  it("prints a verb's header for --help and for -h, wherever they sit, and runs nothing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // `cn show -h` is the contract of show, not a query for the id `-h`.
    expect(await cn(["show", "-h"])).toBe(0);
    expect(log.mock.calls[0]?.[0]).toMatch(/^cn show — one id, and its neighbourhood/);
    expect(await cn(["ready", "ios", "--help"])).toBe(0);
    expect(log.mock.calls[1]?.[0]).toMatch(/^cn ready —/);
    expect(await cn(["epic", "--help"])).toBe(0);
    expect(log.mock.calls[2]?.[0]).toMatch(/^cn epic —/);
  });

  it("stops reading for help at a --, which ends the flags", () => {
    expect(wantsHelp(["--help"])).toBe(true);
    expect(wantsHelp(["cn-1", "-h"])).toBe(true);
    expect(wantsHelp(["cn-1", "--kind", "finding", "--", "--help"])).toBe(false);
    expect(wantsHelp(["cn-1", "--kind", "finding", "the body"])).toBe(false);
  });
});
