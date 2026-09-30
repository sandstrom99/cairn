import { describe, expect, it } from "vitest";
import { MAX_DELAY, MINUTE, floorToMinute, tick } from "./now.ts";

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

describe("tick", () => {
  const sent = 17 * MINUTE;

  it("does nothing before the deployment has answered", () => {
    expect(tick(undefined, sent, sent + MINUTE, true)).toBeUndefined();
  });

  it("does nothing while the tab is hidden, even past the moment", () => {
    expect(tick(sent + MINUTE, sent, sent + 2 * MINUTE, false)).toBeUndefined();
  });

  it("does nothing for a moment at or before the clock it was sent, rather than loop", () => {
    expect(tick(sent, sent, sent + MINUTE, true)).toBeUndefined();
    expect(tick(sent - 1, sent, sent + MINUTE, true)).toBeUndefined();
  });

  it("advances at once when the moment has been reached", () => {
    expect(tick(sent + MINUTE, sent, sent + MINUTE, true)).toEqual({ advance: true });
    expect(tick(sent + MINUTE, sent, sent + 2 * MINUTE, true)).toEqual({ advance: true });
  });

  it("waits for a moment still ahead", () => {
    expect(tick(sent + MINUTE, sent, sent + 1, true)).toEqual({ delay: MINUTE - 1 });
  });

  it("waits no longer than setTimeout can", () => {
    expect(tick(sent + 2 * MAX_DELAY, sent, sent, true)).toEqual({ delay: MAX_DELAY });
  });
});
