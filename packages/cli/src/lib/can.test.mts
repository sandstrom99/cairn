import { describe, expect, it } from "vitest";
import { can } from "./can.mts";

/** A config declaring what the machine can do; the file is read once elsewhere and handed in. */
const declares = (...list: string[]) => ({ can: list, deployments: {} });

describe("can", () => {
  it("prefers the flag over everything", () => {
    expect(can(["ios"], { CAIRN_CAN: "android" }, declares("web"))).toEqual(["ios"]);
  });

  it("reads a bare --can as nothing, not as absent", () => {
    expect(can([], { CAIRN_CAN: "android" }, declares("web"))).toEqual([]);
  });

  it("takes CAIRN_CAN next, split on commas and whitespace", () => {
    expect(can(undefined, { CAIRN_CAN: "ios, android web" }, declares("web"))).toEqual([
      "ios",
      "android",
      "web",
    ]);
  });

  it("reads an empty CAIRN_CAN as nothing, and does not fall through to the file", () => {
    expect(can(undefined, { CAIRN_CAN: "" }, declares("web"))).toEqual([]);
  });

  it("falls back to what the machine declares in its config", () => {
    expect(can(undefined, {}, declares("web", "android"))).toEqual(["web", "android"]);
  });

  it("is nothing with no flag, no environment and no file", () => {
    expect(can(undefined, {}, null)).toEqual([]);
    expect(can(undefined, {}, { deployments: {} })).toEqual([]);
  });
});
