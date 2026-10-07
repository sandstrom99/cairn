import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./wait.mts";

const NEW = [
  "cn-1",
  "--kind",
  "approval",
  "--owner",
  "harbor",
  "--title",
  "the App Store agreement",
  "--resolves",
  "accept it in App Store Connect",
];

describe("cn wait", () => {
  it("describes a new blocker", () => {
    expect(parse(NEW)).toEqual({
      action: "wait",
      args: {
        issue: "cn-1",
        kind: "approval",
        owner: "harbor",
        title: "the App Store agreement",
        whatResolves: "accept it in App Store Connect",
      },
    });
  });

  it("attaches an existing blocker with --on and nothing else", () => {
    expect(parse(["cn-2", "--on", "bl-3"])).toEqual({
      action: "wait",
      args: { issue: "cn-2", on: "bl-3" },
    });
    expect(() => parse(["cn-2", "--on", "bl-3", "--kind", "approval"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--on", "bl-3", "--nudge", "2026-10-01"])).toThrow(UsageError);
  });

  it("carries a link for a new blocker, and refuses one beside --on", () => {
    expect(parse([...NEW, "--link", "[options](https://example.com/o)"])).toMatchObject({
      args: { link: [{ url: "https://example.com/o", label: "options" }] },
    });
    expect(() => parse(["cn-2", "--on", "bl-3", "--link", "https://example.com/x"])).toThrow(
      /^--on attaches an existing blocker; --link describes a new one$/,
    );
  });

  it("turns --nudge into a number, and refuses what is not a date", () => {
    expect(parse([...NEW, "--nudge", "2026-10-01"])).toMatchObject({
      args: { nudgeAt: Date.parse("2026-10-01") },
    });
    expect(() => parse([...NEW, "--nudge", "next tuesday"])).toThrow(UsageError);
  });

  it("needs an issue, a known kind, and the fields that describe the wait", () => {
    expect(() => parse([])).toThrow(UsageError);
    expect(() => parse(["cn-1", "cn-2", "--on", "bl-3"])).toThrow(UsageError);
    expect(() => parse(["cn-1", "--kind", "vibes", "--owner", "harbor"])).toThrow(UsageError);
    expect(() =>
      parse(["cn-1", "--kind", "approval", "--owner", "harbor", "--title", "x"]),
    ).toThrow(/needs --resolves/);
    expect(() =>
      parse(["cn-1", "--kind", "approval", "--title", "the agreement", "--resolves", "sign"]),
    ).toThrow(/needs --owner/);
  });
});
