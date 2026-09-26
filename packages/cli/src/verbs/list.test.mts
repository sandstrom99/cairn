import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./list.mts";

const me = "wsl/balder";

describe("cn list", () => {
  it("passes every filter through as the query's arguments", () => {
    expect(parse(["--project", "cn", "--epic", "ep-1", "--status", "open"], me)).toEqual({
      action: "list",
      json: false,
      args: { project: "cn", epic: "ep-1", status: "open" },
    });
  });

  it("turns --mine into this machine's actor", () => {
    expect(parse(["--mine"], me)).toEqual({
      action: "list",
      json: false,
      args: { claimedBy: me },
    });
  });

  it("asks for nothing when nothing was given", () => {
    expect(parse([], me)).toEqual({ action: "list", json: false, args: {} });
  });

  it("turns --silent into milliseconds and --blocked into true", () => {
    expect(parse(["--silent", "3d"], me).args).toEqual({ silentFor: 259_200_000 });
    expect(parse(["--blocked"], me).args).toEqual({ blocked: true });
  });

  it("composes --silent and --blocked with --epic and --mine", () => {
    expect(parse(["--silent", "36h", "--blocked", "--epic", "ep-1", "--mine"], me)).toEqual({
      action: "list",
      json: false,
      args: { epic: "ep-1", claimedBy: me, silentFor: 36 * 3_600_000, blocked: true },
    });
  });

  it("refuses a duration without a unit it knows", () => {
    expect(() => parse(["--silent", "3x"], me)).toThrow(UsageError);
  });

  it("refuses a status that is not one of the four", () => {
    expect(() => parse(["--status", "blocked"], me)).toThrow(UsageError);
  });

  it("refuses a positional, which is a filter the caller forgot to name", () => {
    expect(() => parse(["ep-1"], me)).toThrow(UsageError);
  });
});
