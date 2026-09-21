import { describe, expect, it } from "vitest";
import { MINUTE, floorToMinute } from "./now.ts";

describe("floorToMinute", () => {
  it("leaves an exact minute alone", () => {
    const minute = 17 * MINUTE;
    expect(floorToMinute(minute)).toBe(minute);
  });

  it("floors 59_999ms past a minute back to it", () => {
    const minute = 17 * MINUTE;
    expect(floorToMinute(minute + 59_999)).toBe(minute);
  });

  it("carries 60_000ms past a minute into the next", () => {
    const minute = 17 * MINUTE;
    expect(floorToMinute(minute + MINUTE)).toBe(minute + MINUTE);
  });
});
