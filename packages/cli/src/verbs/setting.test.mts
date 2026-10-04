import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { tempConfig, tempHome } from "../lib/testing.mts";
import { header } from "./index.mts";
import { SETTINGS } from "../lib/settings.mts";
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
  it("lists with nothing, and sets with a name and on or off", () => {
    expect(parse([])).toEqual({ action: "list", json: false });
    expect(parse(["--json"])).toEqual({ action: "list", json: true });
    expect(parse(["next-session", "on"])).toEqual({
      action: "set",
      setting: "next-session",
      on: true,
    });
    expect(parse(["next-session", "off"])).toMatchObject({ on: false });
  });

  it("refuses a name alone, a word that is not on or off, a third word, and --json on a set", () => {
    expect(() => parse(["next-session"])).toThrow(UsageError);
    expect(() => parse(["next-session", "yes"])).toThrow(UsageError);
    expect(() => parse(["next-session", "on", "now"])).toThrow(UsageError);
    expect(() => parse(["next-session", "on", "--json"])).toThrow(/--json goes with the list/);
  });

  it("prints one line per setting, on or off, with what it does", () => {
    expect(settingLines([{ name: "next-session", on: false, summary: "x" }])).toEqual([
      "next-session  off  x",
    ]);
    expect(settingLines([{ name: "next-session", on: true, summary: "x" }])).toEqual([
      "next-session  on   x",
    ]);
  });

  it("names every setting in its header, which is its --help", () => {
    for (const s of SETTINGS) expect(header("setting")).toContain(s.name);
  });

  it("lists every setting as off on a machine with no config", () => {
    const listed = under({ XDG_CONFIG_HOME: tempHome() }, ["--json"]);
    expect(listed.code).toBe(0);
    expect(JSON.parse(listed.out)).toEqual(
      SETTINGS.map((s) => ({ name: s.name, on: false, summary: s.summary })),
    );
  });

  it("turns one on in the file, 600, and off again leaves what the file held", () => {
    const env = tempConfig(config);
    const on = under(env, ["next-session", "on"]);
    expect(on).toMatchObject({ code: 0, out: "next-session on" });
    expect(JSON.parse(readFileSync(on.file, "utf8"))).toEqual({
      ...config,
      settings: { "next-session": true },
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
    const refused = under(tempConfig(config), ["nope", "on"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toBe("✗ nope is not a setting; there is next-session");
  });

  it("refuses to set on a machine with no config, naming cn init", () => {
    const refused = under({ XDG_CONFIG_HOME: tempHome() }, ["next-session", "on"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toMatch(/no config at .* to keep a setting in: cn init/);
  });
});
