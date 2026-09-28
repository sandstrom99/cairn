import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import {
  actorCheck,
  canCheck,
  checkLines,
  deploymentCheck,
  nodeCheck,
  parse,
  pingChecks,
} from "./doctor.mts";

const cloud = {
  name: "cairn",
  url: "https://tidy-otter-1.convex.cloud",
  source: "config" as const,
  secret: "s3cret/+=",
  secretSource: "config" as const,
};

describe("cn doctor", () => {
  it("takes --json and nothing else", () => {
    expect(parse([])).toEqual({ action: "doctor", json: false });
    expect(parse(["--json"])).toEqual({ action: "doctor", json: true });
    expect(() => parse(["cairn"])).toThrow(UsageError);
  });

  it("passes node at the floor and refuses it below, naming the floor", () => {
    expect(nodeCheck("24.1.0")).toEqual({ check: "node", ok: true, line: "node 24.1.0" });
    expect(nodeCheck("25.0.0").ok).toBe(true);
    const old = nodeCheck("22.12.0");
    expect(old.ok).toBe(false);
    expect(old.line).toMatch(/node 22.12.0: cn needs 24 or later/);
  });

  it("names the deployment, where it came from and where its secret came from, never the secret", () => {
    const fromConfig = deploymentCheck(cloud);
    expect(fromConfig.ok).toBe(true);
    expect(fromConfig.line).toBe(
      "deployment cairn → https://tidy-otter-1.convex.cloud (from config, secret from config)",
    );
    expect(fromConfig.line).not.toContain("s3cret");
    expect(deploymentCheck({ ...cloud, secretSource: "env" }).line).toContain(
      "secret from CAIRN_SECRET",
    );
    expect(
      deploymentCheck({ name: "CAIRN_URL", url: "http://127.0.0.1:3210", source: "env" }).line,
    ).toBe("deployment CAIRN_URL → http://127.0.0.1:3210 (from env, no secret)");
  });

  it("is the one sentence every verb says when nothing resolves", () => {
    const none = deploymentCheck(null);
    expect(none.ok).toBe(false);
    expect(none.line).toMatch(/^no deployment: run `cn init`/);
  });

  it("reads the ping as answered, and the secret as accepted where one was held", () => {
    expect(pingChecks(cloud, { answered: true, projects: 2 })).toEqual([
      { check: "ping", ok: true, line: "deployment answered: 2 project(s)" },
      { check: "secret", ok: true, line: "secret accepted by cairn" },
    ]);
    expect(
      pingChecks(
        { name: "local", url: "http://127.0.0.1:3210", source: "env" },
        { answered: true, projects: 0 },
      ),
    ).toEqual([{ check: "ping", ok: true, line: "deployment answered: 0 project(s)" }]);
  });

  it("names the fix for a refused secret by where the secret came from, and the error otherwise", () => {
    const no = { answered: false, refused: true, message: "wrong secret" } as const;
    const refused = pingChecks(cloud, no);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ check: "ping", ok: false });
    // The file's secret, refused: the stored command takes the current one.
    expect(refused[0]!.line).toBe(
      "cairn refused the secret this machine holds: cn init --refresh --name cairn takes the current one",
    );
    // The file holds none: a command has to be given once.
    const { secret: _s, secretSource: _src, ...bare } = cloud;
    expect(pingChecks(bare, no)[0]!.line).toBe(
      "cairn needs a secret: cn init --refresh --name cairn --secret-cmd '<command>' stores one",
    );
    // The shell's: the file is not what is wrong, so the shell is what gets fixed.
    expect(pingChecks({ ...cloud, secretSource: "env" }, no)[0]!.line).toBe(
      "cairn refused CAIRN_SECRET: set CAIRN_SECRET to the deployment's current one",
    );
    expect(
      pingChecks(
        { name: "CAIRN_URL", url: "https://tidy-otter-1.convex.cloud", source: "env" },
        no,
      )[0]!.line,
    ).toBe("CAIRN_URL needs a secret: set CAIRN_SECRET to the deployment's current one");
    expect(pingChecks(null, { answered: false, refused: false, message: "fetch failed" })).toEqual([
      { check: "ping", ok: false, line: "deployment did not answer: fetch failed" },
    ]);
  });

  it("names who this shell acts as, with its session where the hook exported one", () => {
    expect(actorCheck({ name: "wsl/claude", kind: "agent", session: "s-1" })).toEqual({
      check: "actor",
      ok: true,
      line: "actor wsl/claude (agent), session s-1",
    });
    expect(actorCheck({ name: "wsl/balder", kind: "human" }).line).toBe(
      "actor wsl/balder (human), no session",
    );
  });

  it("names what this session can do, and says so when it declared nothing", () => {
    expect(canCheck(["web", "android"])).toEqual({
      check: "can",
      ok: true,
      line: "can web android",
    });
    expect(canCheck([]).line).toBe("can nothing declared");
  });

  it("prints one marked line per check", () => {
    expect(
      checkLines([
        { check: "node", ok: true, line: "node 24.1.0" },
        { check: "ping", ok: false, line: "deployment did not answer: fetch failed" },
      ]),
    ).toEqual(["✓ node 24.1.0", "✗ deployment did not answer: fetch failed"]);
  });
});
