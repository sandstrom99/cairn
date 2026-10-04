// session.test.mts: one call, one read of the config file, and the two facts derived
// from it. The count is the point: `readConfig` is wrapped in a spy, and every path
// through `session` and `connect` is held to calling it exactly once. The last test
// holds the other half structurally: no verb imports the readers for itself, so the
// only way to a deployment or an actor is through here.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connect } from "./client.mts";
import { readConfig } from "./config.mts";
import { session } from "./session.mts";
import { tempConfig, tempHome } from "./testing.mts";

vi.mock("./config.mts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./config.mts")>();
  return { ...original, readConfig: vi.fn(original.readConfig) };
});

const reads = vi.mocked(readConfig);
beforeEach(() => reads.mockClear());

/** A machine set up for one deployment, in a Claude Code session. */
const configured = (): NodeJS.ProcessEnv => ({
  ...tempConfig({
    default: "a",
    host: "mac",
    // Written by `cn init --can` before capabilities went (cn-118): still loads, never read.
    can: ["web"],
    deployments: { a: { url: "https://a", secret: "s" } },
  }),
  CLAUDECODE: "1",
  CAIRN_SESSION: "s-1",
});

describe("session", () => {
  it("reads the file once, and derives the deployment and the actor from that read", () => {
    const s = session(configured());
    expect(reads).toHaveBeenCalledTimes(1);
    expect(s.config?.host).toBe("mac");
    expect(s.deployment).toMatchObject({ name: "a", url: "https://a", secret: "s" });
    expect(s.actor).toEqual({ name: "mac/claude", kind: "agent", session: "s-1" });
    expect(Object.keys(s).sort()).toEqual(["actor", "config", "deployment"]);
  });

  it("is a session with no deployment on a machine with no file, and still an actor", () => {
    const s = session({ XDG_CONFIG_HOME: tempHome() });
    expect(reads).toHaveBeenCalledTimes(1);
    expect(s.config).toBeNull();
    expect(s.deployment).toBeNull();
    expect(s.actor.kind).toBe("human");
  });

  it("resolves CAIRN_URL without a file, in the same one read", () => {
    const s = session({ XDG_CONFIG_HOME: tempHome(), CAIRN_URL: "https://env" });
    expect(reads).toHaveBeenCalledTimes(1);
    expect(s.deployment).toMatchObject({ name: "CAIRN_URL", source: "CAIRN_URL" });
  });
});

describe("connect", () => {
  it("is the session with the client for its deployment, in the same one read", () => {
    const c = connect(configured());
    expect(reads).toHaveBeenCalledTimes(1);
    expect(c.deployment.name).toBe("a");
    expect(c.actor.name).toBe("mac/claude");
    expect(typeof c.client.query).toBe("function");
    expect(typeof c.client.mutation).toBe("function");
  });

  it("refuses with the one sentence when nothing names a deployment", () => {
    expect(() => connect({ XDG_CONFIG_HOME: tempHome() })).toThrow(/^no deployment: run `cn init`/);
  });
});

describe("no verb reads the config for itself", () => {
  const dir = fileURLToPath(new URL("../verbs", import.meta.url));
  const verbs = readdirSync(dir).filter((f) => f.endsWith(".mts") && !f.endsWith(".test.mts"));

  /** Every value a verb imports from "../lib/<module>.mts"; a type is not a read. */
  const takes = (file: string, module: string): string[] => {
    const src = readFileSync(join(dir, file), "utf8");
    const from = new RegExp(`import\\s+\\{([^}]*)\\}\\s+from\\s+"\\.\\./lib/${module}\\.mts"`, "g");
    return [...src.matchAll(from)].flatMap((m) =>
      m[1]!
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n !== "" && !n.startsWith("type ")),
    );
  };

  it("takes the actor from the session alone", () => {
    for (const file of verbs)
      expect({ file, actor: takes(file, "actor") }).toEqual({ file, actor: [] });
  });

  it("resolves no deployment itself, and reads the file only to write it", () => {
    for (const file of verbs) {
      const named = takes(file, "config");
      expect({ file, resolves: named.includes("resolveDeployment") }).toEqual({
        file,
        resolves: false,
      });
      expect({ file, reads: named.includes("readConfig") }).toEqual({
        file,
        reads: file === "init.mts" || file === "setting.mts",
      });
    }
  });
});
