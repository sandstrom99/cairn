import { describe, expect, it } from "vitest";
import { UsageError } from "./cli.mts";
import {
  BLOCKER_KINDS,
  date,
  duration,
  integer,
  maybe,
  need,
  oneOf,
  onlyId,
  priority,
  revision,
} from "./flags.mts";

describe("maybe", () => {
  it("is the key where there is a value, and nothing where there is none", () => {
    expect(maybe("epic", "ep-1")).toEqual({ epic: "ep-1" });
    expect(maybe("epic", undefined)).toEqual({});
    expect({ ...maybe("epic", undefined) }).not.toHaveProperty("epic");
    // null is a value: `--defer-until none` clears a date by sending it.
    expect(maybe("deferUntil", null)).toEqual({ deferUntil: null });
  });
});

describe("need", () => {
  it("hands back what is there, and makes the usage line the error when nothing is", () => {
    expect(need("finding", "cn journal <id> --kind finding")).toBe("finding");
    expect(() => need(undefined, "cn journal <id> --kind finding")).toThrow(
      /^cn journal <id> --kind finding$/,
    );
    expect(() => need(undefined, "usage")).toThrow(UsageError);
  });
});

describe("onlyId", () => {
  it("is the one positional, and refuses none or more", () => {
    expect(onlyId(["cn-1"], "cn claim <id>")).toBe("cn-1");
    expect(() => onlyId([], "cn claim <id>")).toThrow(/^cn claim <id>$/);
    expect(() => onlyId(["cn-1", "cn-2"], "cn claim <id>")).toThrow(UsageError);
  });
});

describe("revision", () => {
  it("is the integer given, and nothing else", () => {
    expect(revision("3", "cn close <id> --revision N")).toBe(3);
    expect(revision("0", "cn close <id> --revision N")).toBe(0);
  });

  it("refuses a missing, blank or fractional one, naming the usage", () => {
    for (const given of [undefined, "", " ", "1.5", "later"])
      expect(() => revision(given, "cn close <id> --revision N")).toThrow(
        /^cn close <id> --revision N: the revision cn last printed for it$/,
      );
  });
});

describe("integer and priority", () => {
  it("is a whole number inside the range, or nothing when not given", () => {
    expect(integer("50", "limit", 1, 200)).toBe(50);
    expect(integer(undefined, "limit", 1, 200)).toBeUndefined();
    expect(priority("0")).toBe(0);
    expect(priority("4")).toBe(4);
    expect(priority(undefined)).toBeUndefined();
  });

  it("refuses a blank, so --priority= is not P0, and anything outside the range", () => {
    for (const given of ["", " ", "5", "-1", "1.5", "soon"])
      expect(() => priority(given)).toThrow(/^--priority is a whole number from 0 to 4, not/);
    for (const given of ["0", "201", "many"])
      expect(() => integer(given, "limit", 1, 200)).toThrow(
        /^--limit is a whole number from 1 to 200, not/,
      );
  });
});

describe("date", () => {
  it("is what Date.parse makes of it, or nothing when not given", () => {
    expect(date("2026-10-01", "nudge")).toBe(Date.parse("2026-10-01"));
    expect(date(undefined, "nudge")).toBeUndefined();
  });

  it("refuses what Date.parse cannot read, naming the flag", () => {
    expect(() => date("next tuesday", "nudge")).toThrow(
      /^--nudge is a date, as YYYY-MM-DD, not "next tuesday"$/,
    );
  });
});

describe("duration", () => {
  it("is a count of minutes, hours or days in milliseconds, or nothing when not given", () => {
    expect(duration("90m", "silent")).toBe(90 * 60_000);
    expect(duration("36h", "silent")).toBe(36 * 3_600_000);
    expect(duration("3d", "silent")).toBe(259_200_000);
    expect(duration("0d", "silent")).toBe(0);
    expect(duration(undefined, "silent")).toBeUndefined();
  });

  it("refuses a count with no unit, a unit with no count, and any other unit", () => {
    for (const given of ["3x", "3", "d", "", "1.5d", "-1d"])
      expect(() => duration(given, "silent")).toThrow(
        new RegExp(`^--silent is a duration, as 90m, 36h or 3d, not "${given}"$`),
      );
  });
});

describe("oneOf", () => {
  it("is the word given when the flag takes it, or nothing when not given", () => {
    expect(oneOf("decision", "kind", BLOCKER_KINDS)).toBe("decision");
    expect(oneOf(undefined, "kind", BLOCKER_KINDS)).toBeUndefined();
  });

  it("refuses any other word, listing the ones it takes", () => {
    expect(() => oneOf("vibes", "kind", BLOCKER_KINDS)).toThrow(
      /^--kind is one of approval, external-wait, decision, credential, purchase, not "vibes"$/,
    );
    expect(() => oneOf("", "kind", BLOCKER_KINDS)).toThrow(UsageError);
  });
});
