import { describe, expect, it } from "vitest";
import { COLUMN_KEY, readCollapsed, writeCollapsed } from "./column.ts";
import { fakeStorage, throwingStorage } from "./storage.fixtures.ts";

describe("readCollapsed and writeCollapsed", () => {
  it("round-trips a collapsed column under one key", () => {
    const storage = fakeStorage();
    writeCollapsed(true, storage);
    expect(storage.entries.get(COLUMN_KEY)).toBe("collapsed");
    expect(readCollapsed(storage)).toBe(true);
  });

  it("stores open as the key's absence", () => {
    const storage = fakeStorage();
    writeCollapsed(true, storage);
    writeCollapsed(false, storage);
    expect(storage.entries.has(COLUMN_KEY)).toBe(false);
    expect(readCollapsed(storage)).toBe(false);
    expect(readCollapsed(fakeStorage())).toBe(false);
  });

  it("reads any other value as open", () => {
    const storage = fakeStorage();
    storage.setItem(COLUMN_KEY, "yes");
    expect(readCollapsed(storage)).toBe(false);
  });

  it("treats a storage that throws as no storage at all", () => {
    expect(readCollapsed(throwingStorage)).toBe(false);
    expect(() => writeCollapsed(true, throwingStorage)).not.toThrow();
    expect(() => writeCollapsed(false, throwingStorage)).not.toThrow();
  });

  it("does the same with no storage", () => {
    expect(readCollapsed(undefined)).toBe(false);
    expect(() => writeCollapsed(true, undefined)).not.toThrow();
  });
});
