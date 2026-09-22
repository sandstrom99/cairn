import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageError, main, redacted, usageFromHeader } from "./cli.mts";

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

describe("redacted", () => {
  it("strikes the secret from a message that echoes the arguments, and nothing else", () => {
    const echoed =
      'ArgumentValidationError: Object contains extra field `actor` that is not in the validator.\n\nObject: {actor: {kind: "agent", name: "wsl/claude"}, can: ["web"], secret: "s3cret/+="}\nValidator: v.object({secret: v.optional(v.string())})';
    const out = redacted(echoed);
    expect(out).not.toContain("s3cret");
    expect(out).toContain('secret: "…"');
    expect(out).toContain('name: "wsl/claude"');
    expect(redacted("deployment unreachable")).toBe("deployment unreachable");
  });

  it("is what main prints, on both error arms", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await main(
      async () => {
        throw new Error('Object: {secret: "s3cret"}');
      },
      { argv: [] },
    );
    expect(err).toHaveBeenCalledWith('✗ Object: {secret: "…"}');
  });
});

describe("usageFromHeader", () => {
  it("reads this file's own leading comment block, which is empty", () => {
    expect(usageFromHeader(import.meta.url)).toBe("");
  });
});
