import { describe, expect, it } from "vitest";
import { SETTINGS, isSetting, settingsOn, withSetting } from "./settings.mts";

const config = { default: "acme", deployments: { acme: { url: "https://x.convex.cloud" } } };

describe("settings", () => {
  it("reads a setting never set as off, with or without a config", () => {
    expect(settingsOn(null)).toEqual([]);
    expect(settingsOn(config)).toEqual([]);
  });

  it("reads only true as on, and only names it knows", () => {
    expect(settingsOn({ ...config, settings: { "next-session": true } })).toEqual(["next-session"]);
    expect(settingsOn({ ...config, settings: { "next-session": false } })).toEqual([]);
    expect(settingsOn({ ...config, settings: { "from-another-cn": true } })).toEqual([]);
  });

  it("turns one on beside everything the file held", () => {
    expect(withSetting({ ...config, host: "wsl" }, "next-session", true)).toEqual({
      ...config,
      host: "wsl",
      settings: { "next-session": true },
    });
  });

  it("turns one off by removing it, and drops settings when nothing is left", () => {
    const on = withSetting(config, "next-session", true);
    expect(withSetting(on, "next-session", false)).toEqual(config);
    expect(JSON.stringify(withSetting(on, "next-session", false))).toBe(JSON.stringify(config));
  });

  it("keeps a name another cn wrote", () => {
    const other = { ...config, settings: { "from-another-cn": true, "next-session": true } };
    expect(withSetting(other, "next-session", false)).toEqual({
      ...config,
      settings: { "from-another-cn": true },
    });
  });

  it("knows its own names and no others", () => {
    expect(isSetting("next-session")).toBe(true);
    expect(isSetting("nope")).toBe(false);
    for (const s of SETTINGS) expect(s.name).toMatch(/^[a-z][a-z-]*$/);
  });
});
