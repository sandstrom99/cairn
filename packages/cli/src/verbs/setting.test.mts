import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { tempConfig, tempHome } from "../lib/testing.mts";
import { header } from "./index.mts";
import { SETTINGS, statesOf } from "../lib/settings.mts";
import { parse, run, settingLines } from "./setting.mts";

const config = { default: "acme", deployments: { acme: { url: "https://x.convex.cloud" } } };

/** `run` under a config home, with what it printed on stdout and stderr. */
function under(env: NodeJS.ProcessEnv, argv: string[]) {
  vi.stubEnv("XDG_CONFIG_HOME", env.XDG_CONFIG_HOME!);
  const out = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const code = run(argv);
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
    expect(parse(["next-session", "auto"])).toEqual({
      action: "set",
      setting: "next-session",
      state: "auto",
    });
  });

  it("refuses a name alone, a third word, and --json on a set", () => {
    expect(() => parse(["next-session"])).toThrow(UsageError);
    expect(() => parse(["next-session", "auto", "now"])).toThrow(UsageError);
    expect(() => parse(["next-session", "auto", "--json"])).toThrow(/--json goes with the list/);
  });

  it("prints one line per setting: its state, what it does and the states it takes", () => {
    const row = { name: "next-session", states: ["off", "offer", "auto"], summary: "x" };
    expect(settingLines([{ ...row, state: "off" }])).toEqual([
      "next-session  off  x (off, offer, auto)",
    ]);
    expect(settingLines([{ ...row, state: "offer" }])).toEqual([
      "next-session  offer  x (off, offer, auto)",
    ]);
  });

  it("names every setting and every state in its header, which is its --help", () => {
    for (const s of SETTINGS) {
      expect(header("setting")).toContain(s.name);
      for (const state of s.states) expect(header("setting")).toContain(state.state);
    }
  });

  it("lists every setting as off on a machine with no config", () => {
    const listed = under({ XDG_CONFIG_HOME: tempHome() }, ["--json"]);
    expect(listed.code).toBe(0);
    expect(JSON.parse(listed.out)).toEqual(
      SETTINGS.map((s) => ({
        name: s.name,
        state: "off",
        states: statesOf(s.name),
        summary: s.summary,
      })),
    );
  });

  it("puts one in a state in the file, moves it, and off again leaves what the file held", () => {
    const env = tempConfig(config);
    const offer = under(env, ["next-session", "offer"]);
    expect(offer).toMatchObject({ code: 0, out: "next-session offer" });
    expect(JSON.parse(readFileSync(offer.file, "utf8"))).toEqual({
      ...config,
      settings: { "next-session": "offer" },
    });
    vi.restoreAllMocks();
    const auto = under(env, ["next-session", "auto"]);
    expect(auto).toMatchObject({ code: 0, out: "next-session auto" });
    expect(JSON.parse(readFileSync(auto.file, "utf8")).settings).toEqual({
      "next-session": "auto",
    });
    vi.restoreAllMocks();
    const off = under(env, ["next-session", "off"]);
    expect(off).toMatchObject({ code: 0, out: "next-session off" });
    expect(JSON.parse(readFileSync(off.file, "utf8"))).toEqual(config);
  });

  it("writes nothing when the setting is already as asked", () => {
    const env = tempConfig(config);
    const before = readFileSync(join(env.XDG_CONFIG_HOME!, "cairn", "config.json"), "utf8");
    const off = under(env, ["next-session", "off"]);
    expect(off.code).toBe(0);
    expect(readFileSync(off.file, "utf8")).toBe(before);
  });

  it("refuses a name that is not a setting, naming the ones there are", () => {
    const refused = under(tempConfig(config), ["nope", "auto"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toBe("✗ nope is not a setting; there is next-session");
  });

  it("refuses a state the setting does not take, naming the ones it does", () => {
    const refused = under(tempConfig(config), ["next-session", "on"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toBe(
      "✗ next-session is off, offer, auto, not on; cn setting --help says what each does",
    );
  });

  it("refuses to set on a machine with no config, naming cn init", () => {
    const refused = under({ XDG_CONFIG_HOME: tempHome() }, ["next-session", "auto"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toMatch(/no config at .* to keep a setting in: cn init/);
  });
});
