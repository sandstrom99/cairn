import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type CairnConfig,
  configPath,
  readConfig,
  resolveDeployment,
  withDeployment,
  writeConfig,
} from "./config.mts";

/** Every XDG_CONFIG_HOME a test makes, removed after it whatever it did. */
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempHome(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

function tempConfig(body: unknown): NodeJS.ProcessEnv {
  const home = tempHome("cairn-config-");
  mkdirSync(join(home, "cairn"));
  writeFileSync(join(home, "cairn", "config.json"), JSON.stringify(body));
  return { XDG_CONFIG_HOME: home };
}

describe("resolveDeployment", () => {
  it("prefers CAIRN_URL over any file", () => {
    const env = {
      ...tempConfig({ deployments: { a: { url: "https://a" } } }),
      CAIRN_URL: "https://env",
    };
    expect(resolveDeployment(env)).toEqual({
      name: "CAIRN_URL",
      url: "https://env",
      source: "env",
    });
  });

  it("uses the default deployment from the file", () => {
    const env = tempConfig({
      default: "b",
      deployments: { a: { url: "https://a" }, b: { url: "https://b" } },
    });
    expect(resolveDeployment(env)).toEqual({ name: "b", url: "https://b", source: "config" });
  });

  it("uses the only deployment when there is one and no default", () => {
    const env = tempConfig({ deployments: { a: { url: "https://a" } } });
    expect(resolveDeployment(env)?.name).toBe("a");
  });

  it("answers null with two deployments and no default", () => {
    const env = tempConfig({ deployments: { a: { url: "https://a" }, b: { url: "https://b" } } });
    expect(resolveDeployment(env)).toBeNull();
  });

  it("answers null with no file at all", () => {
    expect(resolveDeployment({ XDG_CONFIG_HOME: tempHome("cairn-empty-") })).toBeNull();
  });

  it("carries the secret from the file, with its source", () => {
    const env = tempConfig({ deployments: { a: { url: "https://a", secret: "from-file" } } });
    expect(resolveDeployment(env)).toEqual({
      name: "a",
      url: "https://a",
      source: "config",
      secret: "from-file",
      secretSource: "config",
    });
  });

  it("lets CAIRN_SECRET override the file's secret", () => {
    const env = {
      ...tempConfig({ deployments: { a: { url: "https://a", secret: "from-file" } } }),
      CAIRN_SECRET: "from-shell",
    };
    expect(resolveDeployment(env)).toMatchObject({
      url: "https://a",
      secret: "from-shell",
      secretSource: "env",
    });
  });

  it("carries CAIRN_SECRET alongside CAIRN_URL", () => {
    expect(resolveDeployment({ CAIRN_URL: "https://env", CAIRN_SECRET: "s" })).toEqual({
      name: "CAIRN_URL",
      url: "https://env",
      source: "env",
      secret: "s",
      secretSource: "env",
    });
  });

  it("carries no secret when neither the file nor the shell has one", () => {
    const dep = resolveDeployment({ CAIRN_URL: "https://env" });
    expect(dep?.secret).toBeUndefined();
    expect(dep?.secretSource).toBeUndefined();
  });

  it("honours XDG_CONFIG_HOME in the path", () => {
    expect(configPath({ XDG_CONFIG_HOME: "/x" })).toBe("/x/cairn/config.json");
  });
});

/** What `cn init` hands `withDeployment`, minus whatever the test varies. */
const input = { name: "cairn", url: "https://b", makeDefault: false };

describe("withDeployment", () => {
  it("makes the first deployment the whole file, and the default", () => {
    expect(withDeployment(null, { ...input, secret: "s", can: ["web"], host: "wsl" })).toEqual({
      default: "cairn",
      host: "wsl",
      can: ["web"],
      deployments: { cairn: { url: "https://b", secret: "s" } },
    });
  });

  it("writes no secret key when there is no secret, and no host or can when not given", () => {
    expect(withDeployment(null, input)).toEqual({
      default: "cairn",
      deployments: { cairn: { url: "https://b" } },
    });
    // An empty --can is not an answer about what the machine can do.
    expect(withDeployment(null, { ...input, can: [] })).not.toHaveProperty("can");
  });

  it("adds beside what is there, leaving the default, host and can alone", () => {
    const existing: CairnConfig = {
      default: "invyte",
      host: "wsl",
      can: ["web", "android"],
      deployments: { invyte: { url: "https://a", secret: "s" } },
    };
    expect(withDeployment(existing, input)).toEqual({
      default: "invyte",
      host: "wsl",
      can: ["web", "android"],
      deployments: { invyte: { url: "https://a", secret: "s" }, cairn: { url: "https://b" } },
    });
    expect(existing.deployments.cairn).toBeUndefined();
  });

  it("takes the default with --default, and when the file names none", () => {
    const existing: CairnConfig = {
      default: "invyte",
      deployments: { invyte: { url: "https://a" } },
    };
    expect(withDeployment(existing, { ...input, makeDefault: true }).default).toBe("cairn");
    const undecided: CairnConfig = { deployments: { invyte: { url: "https://a" } } };
    expect(withDeployment(undecided, input).default).toBe("cairn");
  });

  it("replaces host and can only when they are given", () => {
    const existing: CairnConfig = {
      default: "invyte",
      host: "wsl",
      can: ["web"],
      deployments: { invyte: { url: "https://a" } },
    };
    expect(withDeployment(existing, { ...input, host: "mac", can: ["ios"] })).toMatchObject({
      host: "mac",
      can: ["ios"],
    });
  });

  it("refuses a name the file already carries, whether or not the url matches", () => {
    const existing: CairnConfig = { deployments: { cairn: { url: "https://b" } } };
    expect(() => withDeployment(existing, input)).toThrow(/already a deployment/);
    expect(() => withDeployment(existing, { ...input, url: "https://other" })).toThrow(
      /already a deployment/,
    );
  });

  it("treats a file with no deployments key as one with none", () => {
    expect(withDeployment({ default: "gone" } as CairnConfig, input).deployments).toEqual({
      cairn: { url: "https://b" },
    });
  });
});

describe("writeConfig", () => {
  const home = (): NodeJS.ProcessEnv => ({ XDG_CONFIG_HOME: tempHome("cairn-write-") });
  const mode = (file: string): number => statSync(file).mode & 0o777;

  const config: CairnConfig = {
    default: "cairn",
    deployments: { cairn: { url: "https://b", secret: "s" } },
  };

  it("creates the directory and writes the file 600", () => {
    const env = home();
    const file = writeConfig(config, env);
    expect(file).toBe(configPath(env));
    expect(mode(file)).toBe(0o600);
    expect(mode(dirname(file))).toBe(0o700);
  });

  it("round-trips through readConfig, with a trailing newline", () => {
    const env = home();
    expect(readConfig(env)).toBeNull();
    const file = writeConfig(config, env);
    expect(readConfig(env)).toEqual(config);
    expect(readFileSync(file, "utf8").endsWith("}\n")).toBe(true);
  });

  it("tightens a file that was already there and looser, since the secret is in it", () => {
    const env = home();
    const file = writeConfig(config, env);
    chmodSync(file, 0o644);
    writeConfig(config, env);
    expect(mode(file)).toBe(0o600);
  });

  it("leaves no temp file behind", () => {
    const env = home();
    const file = writeConfig(config, env);
    expect(readdirSync(dirname(file))).toEqual(["config.json"]);
  });
});
