import { describe, expect, it } from "vitest";
import {
  SETTINGS,
  type Setting,
  settingsSet as settingsSetOf,
  statesOf,
  withSetting,
} from "./settings.mts";

/** A setting to hold the system to, since cn has none of its own yet. */
const HAND_ON: Setting = {
  name: "hand-on",
  summary: "a stand-in",
  states: [
    { state: "offer", does: "it offers" },
    { state: "auto", does: "it does" },
  ],
};

const settingsSet = (config: Parameters<typeof settingsSetOf>[0]) =>
  settingsSetOf(config, [HAND_ON]);

const config = { default: "acme", deployments: { acme: { url: "https://x.convex.cloud" } } };

describe("settings", () => {
  it("reads a setting never set as off, with or without a config", () => {
    expect(settingsSet(null)).toEqual([]);
    expect(settingsSet(config)).toEqual([]);
  });

  it("reads a state the setting takes, and anything else as off", () => {
    expect(settingsSet({ ...config, settings: { "hand-on": "auto" } })).toEqual([
      { name: "hand-on", state: "auto" },
    ]);
    expect(settingsSet({ ...config, settings: { "hand-on": "offer" } })).toEqual([
      { name: "hand-on", state: "offer" },
    ]);
    for (const value of [true, false, "off", "on", "loud"])
      expect(settingsSet({ ...config, settings: { "hand-on": value } })).toEqual([]);
    expect(settingsSet({ ...config, settings: { "from-another-cn": "auto" } })).toEqual([]);
  });

  it("puts one in a state beside everything the file held", () => {
    expect(withSetting({ ...config, host: "wsl" }, "hand-on", "offer")).toEqual({
      ...config,
      host: "wsl",
      settings: { "hand-on": "offer" },
    });
  });

  it("moves one from a state to another", () => {
    const offered = withSetting(config, "hand-on", "offer");
    expect(withSetting(offered, "hand-on", "auto").settings).toEqual({
      "hand-on": "auto",
    });
  });

  it("turns one off by removing it, and drops settings when nothing is left", () => {
    const set = withSetting(config, "hand-on", "auto");
    expect(withSetting(set, "hand-on", "off")).toEqual(config);
    expect(JSON.stringify(withSetting(set, "hand-on", "off"))).toBe(JSON.stringify(config));
  });

  it("keeps a name another cn wrote", () => {
    const other = { ...config, settings: { "from-another-cn": true, "hand-on": "auto" } };
    expect(withSetting(other, "hand-on", "off")).toEqual({
      ...config,
      settings: { "from-another-cn": true },
    });
  });

  it("starts every setting at off, and has none of its own yet", () => {
    expect(statesOf(HAND_ON)).toEqual(["off", "offer", "auto"]);
    expect(SETTINGS).toEqual([]);
    // A machine that turned the first setting on, before it went, reads as nothing set.
    expect(settingsSetOf({ ...config, settings: { "next-session": "auto" } })).toEqual([]);
  });
});
