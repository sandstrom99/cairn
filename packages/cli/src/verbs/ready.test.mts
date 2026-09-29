import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./ready.mts";

describe("cn ready", () => {
  it("asks for everything, and takes --json", () => {
    expect(parse([])).toEqual({ action: "ready", json: false });
    expect(parse(["--json"])).toEqual({ action: "ready", json: true });
  });

  it("takes no capabilities: work one machine alone can do says so in its own text", () => {
    expect(() => parse(["--can", "web"])).toThrow("unknown option --can");
  });

  it("refuses a positional rather than run past it: cn ready ios is not cn ready", () => {
    expect(() => parse(["ios"])).toThrow(UsageError);
    expect(() => parse(["--json", "ios"])).toThrow(/got "ios"/);
  });
});
