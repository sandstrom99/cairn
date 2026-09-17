import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./reconcile.mts";

/** The machine's username, for the last fallback in the owner chain. */
const username = () => "balder";

describe("cn reconcile", () => {
  it("takes one epic and the owner the raises are addressed to", () => {
    expect(parse(["ep-3", "--owner", "maria"], {}, username)).toEqual({
      action: "run",
      json: false,
      args: { id: "ep-3", owner: "maria" },
    });
  });

  it("falls back to CAIRN_OWNER, then to this machine's user", () => {
    expect(parse(["ep-3"], { CAIRN_OWNER: "balder" }, username).action).toBe("run");
    expect(parse(["ep-3"], { CAIRN_OWNER: "maria" }, username)).toMatchObject({
      args: { owner: "maria" },
    });
    expect(parse(["ep-3"], {}, username)).toMatchObject({ args: { owner: "balder" } });
  });

  it("carries --json", () => {
    expect(parse(["ep-0", "--json"], {}, username)).toEqual({
      action: "run",
      json: true,
      args: { id: "ep-0", owner: "balder" },
    });
  });

  it("refuses anything that is not an epic id, and a second one", () => {
    expect(() => parse(["cn-7"], {}, username)).toThrow(UsageError);
    expect(() => parse([], {}, username)).toThrow(UsageError);
    expect(() => parse(["ep-1", "ep-2"], {}, username)).toThrow(UsageError);
  });

  it("answers --help before anything else", () => {
    expect(parse(["--help"], {}, username)).toEqual({ action: "help" });
  });
});
