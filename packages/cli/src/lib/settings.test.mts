import { describe, expect, it } from "vitest";
import { SETTINGS, isSetting, settingsSet, statesOf, withSetting } from "./settings.mts";

const config = { default: "acme", deployments: { acme: { url: "https://x.convex.cloud" } } };

describe("settings", () => {
  it("reads a setting never set as off, with or without a config", () => {
    expect(settingsSet(null)).toEqual([]);
    expect(settingsSet(config)).toEqual([]);
  });

  it("reads a state the setting takes, and anything else as off", () => {
    expect(settingsSet({ ...config, settings: { "next-session": "auto" } })).toEqual([
      { name: "next-session", state: "auto" },
    ]);
    expect(settingsSet({ ...config, settings: { "next-session": "offer" } })).toEqual([
      { name: "next-session", state: "offer" },
    ]);
    for (const value of [true, false, "off", "on", "loud"])
      expect(settingsSet({ ...config, settings: { "next-session": value } })).toEqual([]);
    expect(settingsSet({ ...config, settings: { "from-another-cn": "auto" } })).toEqual([]);
  });

  it("puts one in a state beside everything the file held", () => {
    expect(withSetting({ ...config, host: "wsl" }, "next-session", "offer")).toEqual({
      ...config,
      host: "wsl",
      settings: { "next-session": "offer" },
    });
  });

  it("moves one from a state to another", () => {
    const offered = withSetting(config, "next-session", "offer");
    expect(withSetting(offered, "next-session", "auto").settings).toEqual({
      "next-session": "auto",
    });
  });

  it("turns one off by removing it, and drops settings when nothing is left", () => {
    const set = withSetting(config, "next-session", "auto");
    expect(withSetting(set, "next-session", "off")).toEqual(config);
    expect(JSON.stringify(withSetting(set, "next-session", "off"))).toBe(JSON.stringify(config));
  });

  it("keeps a name another cn wrote", () => {
    const other = { ...config, settings: { "from-another-cn": true, "next-session": "auto" } };
    expect(withSetting(other, "next-session", "off")).toEqual({
      ...config,
      settings: { "from-another-cn": true },
    });
  });

  it("knows its own names, and every setting starts at off", () => {
    expect(isSetting("next-session")).toBe(true);
    expect(isSetting("nope")).toBe(false);
    expect(statesOf("next-session")).toEqual(["off", "offer", "auto"]);
    for (const s of SETTINGS) {
      expect(s.name).toMatch(/^[a-z][a-z-]*$/);
      expect(s.states.map((state) => state.state)).not.toContain("off");
    }
  });
});
