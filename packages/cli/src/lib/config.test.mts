import { chmodSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type CairnConfig,
  configDir,
  configPath,
  readConfig,
  readSecret,
  removeSecret,
  resolveDeployment,
  secretPath,
  withDeployment,
  withSecretCmd,
  writeConfig,
  writeSecret,
} from "./config.mts";
import { tempConfig, tempHome } from "./testing.mts";

describe("readConfig", () => {
  it("is the file parsed, or null when there is none", () => {
    expect(readConfig(tempConfig({ deployments: { a: { url: "https://a" } } }))).toEqual({
      deployments: { a: { url: "https://a" } },
    });
    expect(readConfig({ XDG_CONFIG_HOME: tempHome() })).toBeNull();
  });
});

describe("resolveDeployment", () => {
  /** Where the file would be, for the messages that name it. */
  const env = { XDG_CONFIG_HOME: "/nowhere" };

  it("prefers CAIRN_URL over any file", () => {
    expect(
      resolveDeployment(
        { ...env, CAIRN_URL: "https://env" },
        { deployments: { a: { url: "https://a" } } },
      ),
    ).toEqual({ name: "CAIRN_URL", url: "https://env", source: "CAIRN_URL" });
  });

  it("uses the default deployment from the file", () => {
    expect(
      resolveDeployment(env, {
        default: "b",
        deployments: { a: { url: "https://a" }, b: { url: "https://b" } },
      }),
    ).toEqual({ name: "b", url: "https://b", source: "default" });
  });

  it("uses the only deployment when there is one and no default", () => {
    expect(resolveDeployment(env, { deployments: { a: { url: "https://a" } } })?.name).toBe("a");
  });

  it("answers null with two deployments and no default", () => {
    expect(
      resolveDeployment(env, { deployments: { a: { url: "https://a" }, b: { url: "https://b" } } }),
    ).toBeNull();
  });

  it("answers null with no file at all", () => {
    expect(resolveDeployment(env, null)).toBeNull();
  });

  it("names the file when the default names no deployment, with or without a deployments key", () => {
    const named = `${configPath(env)}: default "cairn" names no deployment in the file`;
    expect(() => resolveDeployment(env, { default: "cairn" } as CairnConfig)).toThrow(named);
    expect(() =>
      resolveDeployment(env, {
        default: "cairn",
        deployments: { local: { url: "http://127.0.0.1:3210" } },
      }),
    ).toThrow(named);
  });

  it("names the file when the default deployment has no url", () => {
    expect(() =>
      resolveDeployment(env, {
        default: "cairn",
        deployments: { cairn: { secret: "s" } },
      } as unknown as CairnConfig),
    ).toThrow(`${configPath(env)}: deployment "cairn" has no url`);
  });

  it("reads a secret still cached in the file by a cn from before, with its source", () => {
    expect(
      resolveDeployment(env, {
        deployments: { a: { url: "https://a", secret: "cached-in-file" } },
      }),
    ).toEqual({
      name: "a",
      url: "https://a",
      source: "default",
      secret: "cached-in-file",
      secretSource: "config",
    });
  });

  it("lets CAIRN_SECRET override the file's secret", () => {
    expect(
      resolveDeployment(
        { ...env, CAIRN_SECRET: "from-shell" },
        { deployments: { a: { url: "https://a", secret: "cached-in-file" } } },
      ),
    ).toMatchObject({ url: "https://a", secret: "from-shell", secretSource: "env" });
  });

  describe("secrets/<name>", () => {
    const stale: CairnConfig = { deployments: { a: { url: "https://a", secret: "stale" } } };

    it("carries the secret from secrets/<name> over one the config caches", () => {
      const env = { XDG_CONFIG_HOME: tempHome() };
      writeSecret("a", "from-secrets", env);
      expect(resolveDeployment(env, stale)).toEqual({
        name: "a",
        url: "https://a",
        source: "default",
        secret: "from-secrets",
        secretSource: "file",
      });
    });

    it("carries it for the deployment CAIRN_DEPLOYMENT names", () => {
      const env = { XDG_CONFIG_HOME: tempHome() };
      writeSecret("a", "from-secrets", env);
      expect(resolveDeployment({ ...env, CAIRN_DEPLOYMENT: "a" }, stale)).toEqual({
        name: "a",
        url: "https://a",
        source: "CAIRN_DEPLOYMENT",
        secret: "from-secrets",
        secretSource: "file",
      });
    });

    it("gives way to CAIRN_SECRET", () => {
      const env = { XDG_CONFIG_HOME: tempHome() };
      writeSecret("a", "from-secrets", env);
      expect(resolveDeployment({ ...env, CAIRN_SECRET: "s" }, stale)).toMatchObject({
        secret: "s",
        secretSource: "env",
      });
    });

    it("is not read for a name the config does not have", () => {
      const env = { XDG_CONFIG_HOME: tempHome() };
      writeSecret("b", "for-b", env);
      expect(resolveDeployment(env, { deployments: { a: { url: "https://a" } } })).toEqual({
        name: "a",
        url: "https://a",
        source: "default",
      });
    });
  });

  it("carries CAIRN_SECRET alongside CAIRN_URL", () => {
    expect(
      resolveDeployment({ ...env, CAIRN_URL: "https://env", CAIRN_SECRET: "s" }, null),
    ).toEqual({
      name: "CAIRN_URL",
      url: "https://env",
      source: "CAIRN_URL",
      secret: "s",
      secretSource: "env",
    });
  });

  describe("CAIRN_DEPLOYMENT", () => {
    const two: CairnConfig = {
      default: "cairn",
      deployments: {
        cairn: { url: "https://cairn", secret: "cairn-secret" },
        northwind: { url: "https://northwind", secret: "northwind-secret" },
      },
    };

    it("names a deployment in the file over its default, with the file's secret", () => {
      expect(resolveDeployment({ ...env, CAIRN_DEPLOYMENT: "northwind" }, two)).toEqual({
        name: "northwind",
        url: "https://northwind",
        source: "CAIRN_DEPLOYMENT",
        secret: "northwind-secret",
        secretSource: "config",
      });
    });

    it("gives way to CAIRN_URL", () => {
      expect(
        resolveDeployment({ ...env, CAIRN_URL: "https://env", CAIRN_DEPLOYMENT: "northwind" }, two),
      ).toEqual({ name: "CAIRN_URL", url: "https://env", source: "CAIRN_URL" });
    });

    it("is unset when empty, so the default resolves", () => {
      expect(resolveDeployment({ ...env, CAIRN_DEPLOYMENT: "" }, two)).toMatchObject({
        name: "cairn",
        source: "default",
      });
    });

    it("lets CAIRN_SECRET override the named deployment's secret", () => {
      expect(
        resolveDeployment(
          { ...env, CAIRN_DEPLOYMENT: "northwind", CAIRN_SECRET: "from-shell" },
          two,
        ),
      ).toMatchObject({
        name: "northwind",
        source: "CAIRN_DEPLOYMENT",
        secret: "from-shell",
        secretSource: "env",
      });
    });

    it("refuses a name the file lacks, naming the ones it has in file order", () => {
      expect(() => resolveDeployment({ ...env, CAIRN_DEPLOYMENT: "nope" }, two)).toThrow(
        "CAIRN_DEPLOYMENT is nope, and this machine has no deployment by that name (it has cairn, northwind): cn init --name nope sets it up (cn init --help)",
      );
    });

    it("says none when the file has no deployments", () => {
      expect(() =>
        resolveDeployment({ ...env, CAIRN_DEPLOYMENT: "nope" }, {} as CairnConfig),
      ).toThrow(
        "CAIRN_DEPLOYMENT is nope, and this machine has no deployment by that name (it has none): cn init --name nope sets it up (cn init --help)",
      );
    });

    it("refuses with no config at all rather than answering null", () => {
      expect(() => resolveDeployment({ ...env, CAIRN_DEPLOYMENT: "nope" }, null)).toThrow(
        "CAIRN_DEPLOYMENT is nope, and this machine has no cairn config: cn init --name nope sets it up (cn init --help)",
      );
    });
  });

  it("carries no secret when neither the file nor the shell has one", () => {
    const dep = resolveDeployment({ ...env, CAIRN_URL: "https://env" }, null);
    expect(dep?.secret).toBeUndefined();
    expect(dep?.secretSource).toBeUndefined();
  });

  it("honours XDG_CONFIG_HOME in the paths", () => {
    expect(configDir({ XDG_CONFIG_HOME: "/x" })).toBe("/x/cairn");
    expect(configPath({ XDG_CONFIG_HOME: "/x" })).toBe("/x/cairn/config.json");
    expect(secretPath("a", { XDG_CONFIG_HOME: "/x" })).toBe("/x/cairn/secrets/a");
  });
});

/** What `cn init` hands `withDeployment`, minus whatever the test varies. */
const input = { name: "cairn", url: "https://b", makeDefault: false };

describe("withDeployment", () => {
  it("makes the first deployment the whole file, and the default", () => {
    expect(withDeployment(null, { ...input, host: "wsl" })).toEqual({
      default: "cairn",
      host: "wsl",
      deployments: { cairn: { url: "https://b" } },
    });
  });

  it("writes no host when not given", () => {
    expect(withDeployment(null, input)).toEqual({
      default: "cairn",
      deployments: { cairn: { url: "https://b" } },
    });
  });

  it("adds beside what is there, leaving the default and the host alone", () => {
    const existing: CairnConfig = {
      default: "northwind",
      host: "wsl",
      deployments: { northwind: { url: "https://a", secret: "s" } },
    };
    expect(withDeployment(existing, input)).toEqual({
      default: "northwind",
      host: "wsl",
      deployments: { northwind: { url: "https://a", secret: "s" }, cairn: { url: "https://b" } },
    });
    expect(existing.deployments.cairn).toBeUndefined();
  });

  it("takes the default with --default, and when the file names none", () => {
    const existing: CairnConfig = {
      default: "northwind",
      deployments: { northwind: { url: "https://a" } },
    };
    expect(withDeployment(existing, { ...input, makeDefault: true }).default).toBe("cairn");
    const undecided: CairnConfig = { deployments: { northwind: { url: "https://a" } } };
    expect(withDeployment(undecided, input).default).toBe("cairn");
  });

  it("replaces the host only when it is given", () => {
    const existing: CairnConfig = {
      default: "northwind",
      host: "wsl",
      deployments: { northwind: { url: "https://a" } },
    };
    expect(withDeployment(existing, { ...input, host: "mac" })).toMatchObject({ host: "mac" });
  });

  it("leaves a can written before capabilities went (cn-118) where it was, unread", () => {
    const existing = {
      default: "northwind",
      can: ["web", "android"],
      deployments: { northwind: { url: "https://a" } },
    } as CairnConfig;
    expect(withDeployment(existing, input)).toMatchObject({ can: ["web", "android"] });
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

  it("keeps the secret command when there is one, and never a secret key", () => {
    const made = withDeployment(null, { ...input, secretCmd: "op read x" });
    expect(made.deployments.cairn).toEqual({ url: "https://b", secretCmd: "op read x" });
    expect(Object.keys(made.deployments.cairn!)).toEqual(["url", "secretCmd"]);
    expect(withDeployment(null, input).deployments.cairn).not.toHaveProperty("secretCmd");
  });
});

describe("withSecretCmd", () => {
  const existing: CairnConfig = {
    default: "northwind",
    host: "wsl",
    deployments: {
      northwind: { url: "https://a", secret: "old" },
      cairn: { url: "https://b", secret: "s", secretCmd: "op read b" },
    },
  };

  it("replaces one deployment's command and drops the secret cached on it, and nothing else", () => {
    expect(withSecretCmd(existing, "northwind", "op read a")).toEqual({
      default: "northwind",
      host: "wsl",
      deployments: {
        northwind: { url: "https://a", secretCmd: "op read a" },
        cairn: { url: "https://b", secret: "s", secretCmd: "op read b" },
      },
    });
    // Pure: what it was handed is as it was.
    expect(existing.deployments.northwind).toEqual({ url: "https://a", secret: "old" });
  });

  it("names the deployment the file does not have, and the ones it does", () => {
    expect(() => withSecretCmd(existing, "nope", "c")).toThrow(
      "nope is not a deployment in the config; it has northwind, cairn",
    );
  });
});

describe("writeConfig", () => {
  const home = (): NodeJS.ProcessEnv => ({ XDG_CONFIG_HOME: tempHome() });
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

  it("writes the secret to secrets/<name> and never into the file", () => {
    const env = home();
    writeConfig(config, env);
    expect(readConfig(env)).toEqual({
      default: "cairn",
      deployments: { cairn: { url: "https://b" } },
    });
    expect(readSecret("cairn", env)).toBe("s");
    const secret = secretPath("cairn", env);
    expect(readFileSync(secret, "utf8")).toBe("s\n");
    expect(mode(secret)).toBe(0o600);
    expect(mode(dirname(secret))).toBe(0o700);
  });

  it("leaves a secrets file that exists alone, since a refresh wrote it", () => {
    const env = home();
    writeSecret("cairn", "newer", env);
    writeConfig(config, env);
    expect(readSecret("cairn", env)).toBe("newer");
  });

  it("round-trips through readConfig with the secret stripped, and a trailing newline", () => {
    const env = home();
    expect(readConfig(env)).toBeNull();
    const file = writeConfig(config, env);
    expect(readConfig(env)).toEqual({
      default: "cairn",
      deployments: { cairn: { url: "https://b" } },
    });
    expect(readFileSync(file, "utf8").endsWith("}\n")).toBe(true);
  });

  it("tightens a file that was already there and looser, since it names the secrets", () => {
    const env = home();
    const file = writeConfig(config, env);
    chmodSync(file, 0o644);
    writeConfig(config, env);
    expect(mode(file)).toBe(0o600);
  });

  it("leaves no temp file behind", () => {
    const env = home();
    const file = writeConfig(config, env);
    expect(readdirSync(dirname(file)).sort()).toEqual(["config.json", "secrets"]);
    expect(readdirSync(dirname(secretPath("cairn", env)))).toEqual(["cairn"]);
  });
});

describe("readSecret, writeSecret and removeSecret", () => {
  const home = (): NodeJS.ProcessEnv => ({ XDG_CONFIG_HOME: tempHome() });
  const mode = (file: string): number => statSync(file).mode & 0o777;

  it("is undefined when there is no file", () => {
    expect(readSecret("cairn", home())).toBeUndefined();
  });

  it("reads back what was written, without its newline", () => {
    const env = home();
    writeSecret("cairn", "s3cret/+=", env);
    expect(readSecret("cairn", env)).toBe("s3cret/+=");
  });

  it("is undefined for an empty file", () => {
    const env = home();
    writeFileSync(writeSecret("cairn", "s", env), "\n");
    expect(readSecret("cairn", env)).toBeUndefined();
  });

  it("reads no name that is not a deployment's, without touching the disk", () => {
    const env = home();
    expect(readSecret("../config.json", env)).toBeUndefined();
    expect(readSecret("Cairn", env)).toBeUndefined();
    expect(existsSync(join(configDir(env), "secrets"))).toBe(false);
  });

  it("removes the file, and removing twice is fine", () => {
    const env = home();
    writeSecret("cairn", "s", env);
    removeSecret("cairn", env);
    expect(readSecret("cairn", env)).toBeUndefined();
    removeSecret("cairn", env);
  });

  it("tightens a looser file it writes over", () => {
    const env = home();
    const file = writeSecret("cairn", "s", env);
    chmodSync(file, 0o644);
    writeSecret("cairn", "t", env);
    expect(mode(file)).toBe(0o600);
    expect(readSecret("cairn", env)).toBe("t");
  });
});
