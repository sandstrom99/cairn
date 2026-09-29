import { chmodSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type CairnConfig,
  configPath,
  readConfig,
  resolveDeployment,
  withDeployment,
  withSecret,
  writeConfig,
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
      resolveDeployment({ CAIRN_URL: "https://env" }, { deployments: { a: { url: "https://a" } } }),
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

  it("carries the secret from the file, with its source", () => {
    expect(
      resolveDeployment(env, { deployments: { a: { url: "https://a", secret: "from-file" } } }),
    ).toEqual({
      name: "a",
      url: "https://a",
      source: "default",
      secret: "from-file",
      secretSource: "config",
    });
  });

  it("lets CAIRN_SECRET override the file's secret", () => {
    expect(
      resolveDeployment(
        { CAIRN_SECRET: "from-shell" },
        { deployments: { a: { url: "https://a", secret: "from-file" } } },
      ),
    ).toMatchObject({ url: "https://a", secret: "from-shell", secretSource: "env" });
  });

  it("carries CAIRN_SECRET alongside CAIRN_URL", () => {
    expect(resolveDeployment({ CAIRN_URL: "https://env", CAIRN_SECRET: "s" }, null)).toEqual({
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
        invyte: { url: "https://invyte", secret: "invyte-secret" },
      },
    };

    it("names a deployment in the file over its default, with the file's secret", () => {
      expect(resolveDeployment({ ...env, CAIRN_DEPLOYMENT: "invyte" }, two)).toEqual({
        name: "invyte",
        url: "https://invyte",
        source: "CAIRN_DEPLOYMENT",
        secret: "invyte-secret",
        secretSource: "config",
      });
    });

    it("gives way to CAIRN_URL", () => {
      expect(
        resolveDeployment({ CAIRN_URL: "https://env", CAIRN_DEPLOYMENT: "invyte" }, two),
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
        resolveDeployment({ ...env, CAIRN_DEPLOYMENT: "invyte", CAIRN_SECRET: "from-shell" }, two),
      ).toMatchObject({
        name: "invyte",
        source: "CAIRN_DEPLOYMENT",
        secret: "from-shell",
        secretSource: "env",
      });
    });

    it("refuses a name the file lacks, naming the ones it has in file order", () => {
      expect(() => resolveDeployment({ ...env, CAIRN_DEPLOYMENT: "nope" }, two)).toThrow(
        "CAIRN_DEPLOYMENT is nope, and this machine has no deployment by that name (it has cairn, invyte): cn init --name nope sets it up (cn init --help)",
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
    const dep = resolveDeployment({ CAIRN_URL: "https://env" }, null);
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

  it("keeps the secret command beside the secret when there is one, and no key when not", () => {
    const made = withDeployment(null, { ...input, secret: "s", secretCmd: "op read x" });
    expect(made.deployments.cairn).toEqual({
      url: "https://b",
      secret: "s",
      secretCmd: "op read x",
    });
    expect(Object.keys(made.deployments.cairn!)).toEqual(["url", "secret", "secretCmd"]);
    expect(withDeployment(null, { ...input, secret: "s" }).deployments.cairn).not.toHaveProperty(
      "secretCmd",
    );
  });
});

describe("withSecret", () => {
  const existing: CairnConfig = {
    default: "invyte",
    host: "wsl",
    can: ["web", "android"],
    deployments: {
      invyte: { url: "https://a", secret: "old" },
      cairn: { url: "https://b", secret: "s", secretCmd: "op read b" },
    },
  };

  it("replaces one deployment's secret and command, and nothing else", () => {
    expect(withSecret(existing, "invyte", { secret: "new", secretCmd: "op read a" })).toEqual({
      default: "invyte",
      host: "wsl",
      can: ["web", "android"],
      deployments: {
        invyte: { url: "https://a", secret: "new", secretCmd: "op read a" },
        cairn: { url: "https://b", secret: "s", secretCmd: "op read b" },
      },
    });
    // Pure: what it was handed is as it was.
    expect(existing.deployments.invyte).toEqual({ url: "https://a", secret: "old" });
  });

  it("names the deployment the file does not have, and the ones it does", () => {
    expect(() => withSecret(existing, "nope", { secret: "s", secretCmd: "c" })).toThrow(
      "nope is not a deployment in the config; it has invyte, cairn",
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
