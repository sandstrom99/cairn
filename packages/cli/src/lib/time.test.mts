import { describe, expect, it } from "vitest";
import { age, day, silence, since } from "./time.mts";

const now = Date.UTC(2026, 8, 17, 12, 0, 0);
const ago = (ms: number): number => now - ms;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("age", () => {
  it("is one token, coarsening as it gets older", () => {
    expect(age(ago(30_000), now)).toBe("just now");
    expect(age(ago(5 * MINUTE), now)).toBe("5m");
    expect(age(ago(2 * HOUR), now)).toBe("2h");
    expect(age(ago(3 * DAY), now)).toBe("3d");
  });

  it("never reads negative when a clock is ahead", () => {
    expect(age(now + HOUR, now)).toBe("just now");
  });
});

describe("since", () => {
  it("adds ago, except to just now", () => {
    expect(since(ago(2 * HOUR), now)).toBe("2h ago");
    expect(since(ago(30_000), now)).toBe("just now");
  });
});

describe("day", () => {
  it("is the date alone", () => {
    expect(day(Date.UTC(2026, 9, 1, 15, 30))).toBe("2026-10-01");
  });
});

describe("silence", () => {
  it("stays in hours for two days, then reads as an age", () => {
    expect(silence(ago(26 * HOUR), now)).toBe("26h");
    expect(silence(ago(47 * HOUR), now)).toBe("47h");
    expect(silence(ago(2 * DAY), now)).toBe("2d");
    expect(silence(ago(9 * DAY), now)).toBe("9d");
  });
});
