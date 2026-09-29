import { afterEach, describe, expect, it, vi } from "vitest";
import { shortcut } from "./platform.ts";

describe("shortcut", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads ⌘K on a Mac and Ctrl K elsewhere", () => {
    expect(shortcut({ platform: "MacIntel" })).toBe("⌘K");
    expect(shortcut({ platform: "Win32" })).toBe("Ctrl K");
  });

  it("takes userAgentData's platform over the older one", () => {
    expect(shortcut({ platform: "Linux x86_64", userAgentData: { platform: "macOS" } })).toBe("⌘K");
  });

  // Node 21 and later define a global navigator, `MacIntel` on a Mac, and an undefined
  // argument falls through to it, so the absent navigator has to be the global's.
  it("reads Ctrl K where there is no navigator", () => {
    vi.stubGlobal("navigator", undefined);
    expect(shortcut()).toBe("Ctrl K");
  });
});
