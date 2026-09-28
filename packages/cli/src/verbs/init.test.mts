import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./init.mts";

/** The whole invocation a fresh machine runs, minus what each test varies. */
const base = ["--name", "cairn", "--url", "https://tidy-otter-1.convex.cloud"];

describe("cn init", () => {
  it("takes the name, the url, what the machine can do and the secret command", () => {
    expect(
      parse(
        [...base, "--secret-cmd", "op read op://Personal/x/secret", "--can", "web", "android"],
        {},
      ),
    ).toEqual({
      action: "init",
      name: "cairn",
      url: "https://tidy-otter-1.convex.cloud",
      secret: { from: "--secret-cmd", command: "op read op://Personal/x/secret" },
      can: ["web", "android"],
      makeDefault: false,
    });
  });

  it("falls back to CAIRN_SECRET, and to an open deployment with neither", () => {
    expect(parse(base, { CAIRN_SECRET: "s" })).toMatchObject({
      secret: { from: "CAIRN_SECRET", value: "s" },
    });
    expect(parse(base, {})).toMatchObject({ secret: { from: "none" } });
    // The one the person just typed wins over whatever the shell was carrying.
    expect(parse([...base, "--secret-cmd", "echo s"], { CAIRN_SECRET: "other" })).toMatchObject({
      secret: { from: "--secret-cmd", command: "echo s" },
    });
  });

  it("carries --host and --default", () => {
    expect(parse([...base, "--host", "mac", "--default"], {})).toMatchObject({
      host: "mac",
      makeDefault: true,
    });
  });

  it("strips trailing slashes from the url", () => {
    expect(parse(["--name", "a", "--url", "https://a.convex.cloud//"], {})).toMatchObject({
      url: "https://a.convex.cloud",
    });
  });

  it("leaves out the keys that were not given", () => {
    const parsed = parse(base, {});
    expect(parsed).not.toHaveProperty("host");
    expect(parsed).not.toHaveProperty("can");
    // An empty list is not an answer about what the machine can do.
    expect(parse([...base, "--can"], {})).not.toHaveProperty("can");
  });

  it("refuses a missing or malformed name", () => {
    expect(() => parse(["--url", "https://a.convex.cloud"], {})).toThrow(UsageError);
    expect(() => parse(["--name", "Cairn", "--url", "https://a"], {})).toThrow(UsageError);
    expect(() => parse(["--name", "-cairn", "--url", "https://a"], {})).toThrow(UsageError);
    expect(() => parse(["--name", "cairn hq", "--url", "https://a"], {})).toThrow(UsageError);
  });

  it("refuses a missing url, one that is not a url, and one that is not http", () => {
    expect(() => parse(["--name", "cairn"], {})).toThrow(UsageError);
    expect(() => parse(["--name", "cairn", "--url", "tidy-otter-1"], {})).toThrow(UsageError);
    expect(() => parse(["--name", "cairn", "--url", "ftp://a.convex.cloud"], {})).toThrow(
      UsageError,
    );
  });

  it("refuses a positional argument, which is a flag the caller forgot to name", () => {
    expect(() => parse([...base, "cairn"], {})).toThrow(UsageError);
  });

  it("takes --refresh bare, or with --name and --secret-cmd", () => {
    expect(parse(["--refresh"], {})).toEqual({ action: "refresh" });
    expect(parse(["--refresh", "--name", "cairn"], {})).toEqual({
      action: "refresh",
      name: "cairn",
    });
    expect(parse(["--refresh", "--secret-cmd", "op read op://Personal/x/secret"], {})).toEqual({
      action: "refresh",
      command: "op read op://Personal/x/secret",
    });
    // CAIRN_SECRET plays no part: the file is what --refresh fixes.
    expect(parse(["--refresh"], { CAIRN_SECRET: "s" })).toEqual({ action: "refresh" });
  });

  it("refuses with --refresh every flag that would change more than the secret, by name", () => {
    for (const [flag, ...rest] of [
      ["url", "https://a.convex.cloud"],
      ["can", "web"],
      ["host", "mac"],
      ["default"],
    ]) {
      expect(() => parse(["--refresh", `--${flag}`, ...rest], {})).toThrow(
        `cn init --refresh takes --name and --secret-cmd alone, not --${flag}`,
      );
    }
  });

  it("refuses a malformed --name with --refresh as without it", () => {
    expect(() => parse(["--refresh", "--name", "Cairn"], {})).toThrow(
      '--name is lowercase letters, digits and dashes, not "Cairn"',
    );
    expect(() => parse(["--refresh", "cairn"], {})).toThrow(UsageError);
  });
});
