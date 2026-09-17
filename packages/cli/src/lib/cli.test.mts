import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageError, main, usageFromHeader } from "./cli.mts";

describe("main", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("exits 0 when the body returns nothing", async () => {
    await main(async () => {}, { argv: [] });
    expect(process.exitCode).toBeUndefined();
  });

  it("uses a returned number as the exit code", async () => {
    await main(async () => 3, { argv: [] });
    expect(process.exitCode).toBe(3);
  });

  it("turns a UsageError into exit 2 with a usage line", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await main(
      async () => {
        throw new UsageError("verb takes an id");
      },
      { argv: [] },
    );
    expect(process.exitCode).toBe(2);
    expect(err).toHaveBeenCalledWith("✗ usage: verb takes an id");
  });

  it("turns any other error into exit 1", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await main(
      async () => {
        throw new Error("deployment unreachable");
      },
      { argv: [] },
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("usageFromHeader", () => {
  it("reads this file's own leading comment block, which is empty", () => {
    expect(usageFromHeader(import.meta.url)).toBe("");
  });
});
