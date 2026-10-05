import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { tempConfig, tempHome } from "../lib/testing.mts";
import { header } from "./index.mts";
import { SETTINGS, type Setting, statesOf } from "../lib/settings.mts";
import { parse, run, settingLines } from "./setting.mts";

/** A setting to hold the verb to, since cn has none of its own yet. */
const HAND_ON: Setting = {
  name: "hand-on",
  summary: "a stand-in",
  states: [
    { state: "offer", does: "it offers" },
    { state: "auto", does: "it does" },
  ],
};

const config = { default: "acme", deployments: { acme: { url: "https://x.convex.cloud" } } };

/** `run` under a config home, with what it printed on stdout and stderr. */
function under(env: NodeJS.ProcessEnv, argv: string[], settings: readonly Setting[] = [HAND_ON]) {
  vi.stubEnv("XDG_CONFIG_HOME", env.XDG_CONFIG_HOME!);
  const out = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const code = run(argv, settings);
  const file = join(env.XDG_CONFIG_HOME!, "cairn", "config.json");
  return {
    code,
    out: out.mock.calls.map((c) => String(c[0])).join("\n"),
    err: err.mock.calls.map((c) => String(c[0])).join("\n"),
    file,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cn setting", () => {
  it("lists with nothing, and sets with a name and a state", () => {
    expect(parse([])).toEqual({ action: "list", json: false });
    expect(parse(["--json"])).toEqual({ action: "list", json: true });
    expect(parse(["hand-on", "auto"])).toEqual({
      action: "set",
      setting: "hand-on",
      state: "auto",
    });
  });

  it("refuses a name alone, a third word, and --json on a set", () => {
    expect(() => parse(["hand-on"])).toThrow(UsageError);
    expect(() => parse(["hand-on", "auto", "now"])).toThrow(UsageError);
    expect(() => parse(["hand-on", "auto", "--json"])).toThrow(/--json goes with the list/);
  });

  it("prints one line per setting: its state, what it does and the states it takes", () => {
    const row = { name: "hand-on", states: ["off", "offer", "auto"], summary: "x" };
    expect(settingLines([{ ...row, state: "off" }])).toEqual([
      "hand-on  off  x (off, offer, auto)",
    ]);
    expect(settingLines([{ ...row, state: "offer" }])).toEqual([
      "hand-on  offer  x (off, offer, auto)",
    ]);
  });

  it("names every setting and every state in its header, which is its --help", () => {
    for (const s of SETTINGS) {
      expect(header("setting")).toContain(s.name);
      for (const state of s.states) expect(header("setting")).toContain(state.state);
    }
    expect(header("setting")).toContain("There is no setting yet");
  });

  it("lists every setting as off on a machine with no config", () => {
    const listed = under({ XDG_CONFIG_HOME: tempHome() }, ["--json"]);
    expect(listed.code).toBe(0);
    expect(JSON.parse(listed.out)).toEqual([
      { name: "hand-on", state: "off", states: statesOf(HAND_ON), summary: "a stand-in" },
    ]);
  });

  it("has no setting of its own yet: the list is empty and every name is refused", () => {
    const env = tempConfig({ ...config, settings: { "next-session": "auto" } });
    const before = readFileSync(join(env.XDG_CONFIG_HOME!, "cairn", "config.json"), "utf8");
    const listed = under(env, [], SETTINGS);
    expect(listed).toMatchObject({ code: 0, out: "" });
    vi.restoreAllMocks();
    expect(JSON.parse(under(env, ["--json"], SETTINGS).out)).toEqual([]);
    vi.restoreAllMocks();
    const refused = under(env, ["next-session", "auto"], SETTINGS);
    expect(refused.code).toBe(1);
    expect(refused.err).toBe("✗ next-session is not a setting; there is none yet");
    expect(readFileSync(refused.file, "utf8")).toBe(before);
  });

  it("puts one in a state in the file, moves it, and off again leaves what the file held", () => {
    const env = tempConfig(config);
    const offer = under(env, ["hand-on", "offer"]);
    expect(offer).toMatchObject({ code: 0, out: "hand-on offer" });
    expect(JSON.parse(readFileSync(offer.file, "utf8"))).toEqual({
      ...config,
      settings: { "hand-on": "offer" },
    });
    vi.restoreAllMocks();
    const auto = under(env, ["hand-on", "auto"]);
    expect(auto).toMatchObject({ code: 0, out: "hand-on auto" });
    expect(JSON.parse(readFileSync(auto.file, "utf8")).settings).toEqual({
      "hand-on": "auto",
    });
    vi.restoreAllMocks();
    const off = under(env, ["hand-on", "off"]);
    expect(off).toMatchObject({ code: 0, out: "hand-on off" });
    expect(JSON.parse(readFileSync(off.file, "utf8"))).toEqual(config);
  });

  it("writes nothing when the setting is already as asked", () => {
    const env = tempConfig(config);
    const before = readFileSync(join(env.XDG_CONFIG_HOME!, "cairn", "config.json"), "utf8");
    const off = under(env, ["hand-on", "off"]);
    expect(off.code).toBe(0);
    expect(readFileSync(off.file, "utf8")).toBe(before);
  });

  it("refuses a name that is not a setting, naming the ones there are", () => {
    const refused = under(tempConfig(config), ["nope", "auto"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toBe("✗ nope is not a setting; there is hand-on");
  });

  it("refuses a state the setting does not take, naming the ones it does", () => {
    const refused = under(tempConfig(config), ["hand-on", "on"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toBe(
      "✗ hand-on is off, offer, auto, not on; cn setting --help says what each does",
    );
  });

  it("refuses to set on a machine with no config, naming cn init", () => {
    const refused = under({ XDG_CONFIG_HOME: tempHome() }, ["hand-on", "auto"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toMatch(/no config at .* to keep a setting in: cn init/);
  });
});
