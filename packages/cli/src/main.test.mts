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

  it("prints a version", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await cn(["--version"])).toBe(0);
    expect(log.mock.calls[0]?.[0]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("rejects an unknown verb as a usage error", async () => {
    await expect(cn(["frobnicate"])).rejects.toThrow(UsageError);
  });
});
