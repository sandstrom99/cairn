import { describe, expect, it } from "vitest";
import { shortcut } from "./platform.ts";

describe("shortcut", () => {
  it("reads ⌘K on a Mac and Ctrl K elsewhere", () => {
    expect(shortcut({ platform: "MacIntel" })).toBe("⌘K");
    expect(shortcut({ platform: "Win32" })).toBe("Ctrl K");
  });

  it("takes userAgentData's platform over the older one", () => {
    expect(shortcut({ platform: "Linux x86_64", userAgentData: { platform: "macOS" } })).toBe("⌘K");
  });

  it("reads Ctrl K where there is no navigator", () => {
    expect(shortcut(undefined)).toBe("Ctrl K");
  });
});
