import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fakeStorage, throwingStorage } from "./storage.fixtures.ts";
import {
  applyTheme,
  DARK_QUERY,
  onSystemTheme,
  readTheme,
  resolveTheme,
  systemTheme,
  THEME_KEY,
  writeTheme,
} from "./theme.ts";

describe("readTheme and writeTheme", () => {
  it("round-trips a choice under one key", () => {
    const storage = fakeStorage();
    writeTheme("dark", storage);
    expect(storage.entries.get(THEME_KEY)).toBe("dark");
    expect(readTheme(storage)).toBe("dark");
  });

  it("reads no choice as undefined", () => {
    expect(readTheme(fakeStorage())).toBeUndefined();
  });

  it("reads any other value as no choice", () => {
    const storage = fakeStorage();
    storage.setItem(THEME_KEY, "sepia");
    expect(readTheme(storage)).toBeUndefined();
  });

  it("treats a storage that throws as no storage at all", () => {
    expect(readTheme(throwingStorage)).toBeUndefined();
    expect(() => writeTheme("dark", throwingStorage)).not.toThrow();
  });

  it("does the same with no storage", () => {
    expect(readTheme(undefined)).toBeUndefined();
    expect(() => writeTheme("light", undefined)).not.toThrow();
  });
});

describe("systemTheme and resolveTheme", () => {
  it("reads the query's answer as a theme", () => {
    expect(systemTheme(true)).toBe("dark");
    expect(systemTheme(false)).toBe("light");
  });

  it("takes the browser's choice over the system's", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme(undefined, "dark")).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("sets the dark class for dark and takes it off for light", () => {
    const toggle = vi.fn();
    applyTheme("dark", { classList: { toggle } as unknown as DOMTokenList });
    applyTheme("light", { classList: { toggle } as unknown as DOMTokenList });
    expect(toggle.mock.calls).toEqual([
      ["dark", true],
      ["dark", false],
    ]);
  });

  it("does nothing without a document", () => {
    expect(() => applyTheme("dark", undefined)).not.toThrow();
  });
});

describe("onSystemTheme", () => {
  it("hands on each change and removes exactly its own listener", () => {
    let captured: ((event: { matches: boolean }) => void) | undefined;
    const addEventListener = vi.fn((_: string, fn: (event: { matches: boolean }) => void) => {
      captured = fn;
    });
    const removeEventListener = vi.fn();
    const query = { addEventListener, removeEventListener } as unknown as MediaQueryList;
    const listen = vi.fn();
    const stop = onSystemTheme(listen, query);
    captured!({ matches: true });
    expect(listen).toHaveBeenCalledWith("dark");
    stop();
    expect(removeEventListener).toHaveBeenCalledWith("change", captured);
  });

  it("returns a function that does nothing without a window", () => {
    const stop = onSystemTheme(() => {}, undefined);
    expect(() => stop()).not.toThrow();
  });
});

describe("index.html", () => {
  it("sets the class before first paint from the same key and the same query", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).toContain(`localStorage.getItem("${THEME_KEY}")`);
    expect(html).toContain(`matchMedia("${DARK_QUERY}")`);
    expect(html).toContain(`classList.add("dark")`);
  });
});
