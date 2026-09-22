import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageError, errorData, main, redacted, usageFromHeader } from "./cli.mts";

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

  it("prints the message the deployment wrote for a ConvexError, once, and exits 1", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await main(
      async () => {
        throw new ConvexError({ kind: "not-found", message: "no such id cn-9" });
      },
      { argv: [] },
    );
    expect(process.exitCode).toBe(1);
    expect(err.mock.calls).toEqual([["✗ no such id cn-9"]]);
  });

  it("prints every change since a stale write's revision, then the real retry line", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await main(
      async () => {
        throw new ConvexError({
          kind: "stale",
          message: "cn-2 is at revision 3, you read 1",
          id: "cn-2",
          yours: 1,
          current: 3,
          since: [
            {
              revision: 2,
              actor: { name: "wsl/other", kind: "agent" },
              at: Date.now(),
              kind: "issue.update",
              changes: { priority: { from: 2, to: 1 } },
            },
            {
              revision: 3,
              actor: { name: "wsl/other", kind: "agent" },
              at: Date.now(),
              kind: "issue.claim",
              changes: { status: { from: "open", to: "in_progress" } },
            },
          ],
        });
      },
      { argv: [] },
    );
    expect(process.exitCode).toBe(1);
    expect(err.mock.calls.map((c) => c[0])).toEqual([
      "✗ cn-2 is at revision 3, you read 1",
      "  r2  wsl/other  just now  issue.update  priority 2 → 1",
      "  r3  wsl/other  just now  issue.claim  status open → in_progress",
      "  re-read with cn show cn-2 and retry with --revision 3",
    ]);
  });
});

describe("errorData", () => {
  it("is the deployment's data for a ConvexError, and undefined for anything else", () => {
    const data = {
      kind: "claimed",
      message: "held",
      id: "cn-1",
      by: { name: "a", kind: "agent" },
      since: 1,
    };
    expect(errorData(new ConvexError(data))).toEqual(data);
    expect(errorData(new ConvexError("a bare string"))).toBeUndefined();
    expect(errorData(new Error("deployment unreachable"))).toBeUndefined();
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
