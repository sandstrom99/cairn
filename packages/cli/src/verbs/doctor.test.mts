import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { checkLines, deploymentCheck, nodeCheck, parse, pingChecks } from "./doctor.mts";

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
    expect(pingChecks(cloud, { projects: 2 })).toEqual([
      { check: "ping", ok: true, line: "deployment answered: 2 project(s)" },
      { check: "secret", ok: true, line: "secret accepted by cairn" },
    ]);
    expect(
      pingChecks({ name: "local", url: "http://127.0.0.1:3210", source: "env" }, { projects: 0 }),
    ).toEqual([{ check: "ping", ok: true, line: "deployment answered: 0 project(s)" }]);
  });

  it("names the field to put the secret in when the deployment refuses, and the error otherwise", () => {
    const refused = pingChecks(cloud, {
      error: new ConvexError({ kind: "unauthorized", message: "wrong secret" }),
    });
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ check: "ping", ok: false });
    expect(refused[0]!.line).toMatch(
      /^cairn needs a secret: put it under deployments\.cairn\.secret in .*config\.json, or set CAIRN_SECRET$/,
    );
    expect(pingChecks(null, { error: new Error("fetch failed") })).toEqual([
      { check: "ping", ok: false, line: "deployment did not answer: fetch failed" },
    ]);
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
