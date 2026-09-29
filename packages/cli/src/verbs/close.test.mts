import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./close.mts";

describe("cn close", () => {
  it("keeps the command as a string, so parse stays pure and run is what runs it", () => {
    expect(parse(["cn-2", "--revision", "2", "--run", "vp run verify"])).toEqual({
      action: "close",
      id: "cn-2",
      revision: 2,
      proof: { run: "vp run verify" },
    });
  });

  it("takes an unverified close with its reason", () => {
    expect(parse(["cn-2", "--revision", "2", "--unverified", "checked on the Pixel"])).toEqual({
      action: "close",
      id: "cn-2",
      revision: 2,
      proof: { unverified: "checked on the Pixel" },
    });
  });

  it("takes the follow-up beside the proof", () => {
    expect(
      parse([
        "cn-2",
        "--revision",
        "2",
        "--run",
        "vp run verify",
        "--follow-up",
        "confirm the lifecycle on a second machine",
        "--kind",
        "verify",
        "--priority",
        "1",
      ]),
    ).toEqual({
      action: "close",
      id: "cn-2",
      revision: 2,
      proof: { run: "vp run verify" },
      followUp: {
        title: "confirm the lifecycle on a second machine",
        kind: "verify",
        priority: 1,
      },
    });
  });

  it("needs exactly one proof", () => {
    expect(() => parse(["cn-2", "--revision", "2"])).toThrow(UsageError);
    expect(() =>
      parse(["cn-2", "--revision", "2", "--run", "vp run verify", "--unverified", "also"]),
    ).toThrow(UsageError);
  });

  it("needs an integer revision, and --revision= is not 0", () => {
    expect(() => parse(["cn-2", "--run", "vp run verify"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--revision", "next", "--run", "vp run verify"])).toThrow(
      UsageError,
    );
    expect(() => parse(["cn-2", "--revision=", "--run", "vp run verify"])).toThrow(
      /the revision cn last printed/,
    );
  });

  it("refuses a follow-up priority that is blank or outside 0 to 4", () => {
    const base = [
      "cn-2",
      "--revision",
      "2",
      "--run",
      "x",
      "--follow-up",
      "check it",
      "--kind",
      "verify",
    ];
    expect(() => parse([...base, "--priority="])).toThrow(/--priority is a whole number/);
    expect(() => parse([...base, "--priority", "7"])).toThrow(UsageError);
  });

  it("refuses a follow-up with no kind, a kind with no follow-up, and a kind that is not one", () => {
    const base = ["cn-2", "--revision", "2", "--run", "vp run verify"];
    expect(() => parse([...base, "--follow-up", "check it"])).toThrow(UsageError);
    expect(() => parse([...base, "--kind", "verify"])).toThrow(UsageError);
    expect(() => parse([...base, "--follow-up", "check it", "--kind", "ship"])).toThrow(UsageError);
  });

  it("refuses --kind and --priority without the follow-up they describe, by name", () => {
    const base = ["cn-2", "--revision", "2", "--run", "vp run verify"];
    expect(() => parse([...base, "--priority", "1"])).toThrow(/--priority belongs to --follow-up/);
    expect(() => parse([...base, "--kind", "verify", "--priority", "1"])).toThrow(
      /--kind and --priority belong to --follow-up/,
    );
  });

  it("takes no --requires on the follow-up", () => {
    const base = ["cn-2", "--revision", "2", "--run", "vp run verify"];
    expect(() =>
      parse([...base, "--follow-up", "check it", "--kind", "verify", "--requires", "ios"]),
    ).toThrow("unknown option --requires");
  });
});
