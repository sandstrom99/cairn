// secret.mjs: the cloud deployment's `CAIRN_SECRET`, set from here and handed out once.
//
//   vp run @cairn/backend#secret -- new [--op op://<vault>/<item>]      the first secret
//   vp run @cairn/backend#secret -- rotate [--op op://<vault>/<item>]   a fresh one in its place
//   vp run @cairn/backend#secret -- revoke                             one nobody holds
//   import { changeSecret } from "./secret.mjs"                        the e2e rows, on a throwaway
//
// The deployment is the one `backend/.env.cloud.local` names, bound by `CONVEX_DEPLOYMENT`
// in convex's environment, which convex takes over any file, the way `cloud.mjs` ships the
// page. convex 1.46 still writes whatever it talked to into `.env.local`, so the script
// holds that file's bytes and puts them back when it exits, however it exits.
//
// `new` sets the first secret on a deployment that has none, and refuses one that has a
// secret already; `rotate` replaces the secret a deployment has, and refuses one that has
// none, since that deployment is open and `new` is what it wants. Every refusal comes
// before anything changes. The value is 32 random bytes as base64, handed to convex on
// stdin, so it is never an argument here or there.
//
// `revoke` sets a secret nobody is given, which fences the deployment: every machine is
// refused until the next `rotate` hands a fresh one out. It is never `convex env remove`.
// The guard (convex/lib/guard.ts) checks nothing on a deployment with no secret, so
// removing it would open the deployment to anyone holding its URL, the opposite of what
// revoking means. One shared secret cannot shut out one machine either: whoever holds it
// is in, and telling machines apart is identity auth (cn-11, cn-28).
//
// The secret goes to exactly one place. With `--op`, into the `secret` field of that
// 1Password item, which is created with the deployment's `url` beside it when there is
// none. The item goes to `op` as JSON on stdin, so the secret is never in its argv either,
// and it has to: through WSL, `op.exe` takes any stdin that is not a terminal as a JSON
// template, `/dev/null` included, and refuses `invalid JSON in piped input` rather than
// read an assignment argument. A template replaces every field of an item it edits, so an
// item that exists is read whole with `op item get`, its `secret` changed, and written
// back as it was otherwise; what it held stays in this process and is never printed. That
// read comes before the deployment changes, so an item that cannot be read changes
// nothing. `op item list` says whether it exists. Without `--op`, on stdout,
// once, for a pipe into whatever keeps it. Every other line goes to stderr and none of them
// carries the secret; a machine takes a rotated one with `cn init --refresh`. vp prints its
// own command line on stdout before the script's, so a pipe runs the script itself,
// `node backend/scripts/secret.mjs rotate | …`, and `vp run` is for `--op`.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { convexSync, holdEnvLocal, packageRoot, valueIn } from "./run-convex.mjs";

const ACTIONS = ["new", "rotate", "revoke"];
const USAGE = "usage: vp run @cairn/backend#secret -- new|rotate|revoke [--op op://<vault>/<item>]";
const NAME = "CAIRN_SECRET";
const OP_REF = /^op:\/\/([^/]+)\/([^/]+)$/;

/** Every non-blank line of `text` through `err`, indented two spaces under the line above. */
const indented = (text, err) => {
  for (const line of (text ?? "").split("\n")) if (line.trim()) err(`  ${line}`);
};

/** What a child said on stderr, with the reason it could not start when it never did. */
const said = (result) => `${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`;

/**
 * Sets a fresh `CAIRN_SECRET` on the deployment `cwd` and `env` reach, and hands it out:
 * `new` and `rotate` to the 1Password item `op` names or to `out`, `revoke` to nobody.
 * `out` receives the secret and nothing else, `err` every other line, and no line through
 * `err` carries the secret. `deployment` is what the lines call the deployment; `url` is its
 * client URL, for the line a machine sets up with and for a 1Password item created here.
 *
 * @param {string} action `new`, `rotate` or `revoke`; anything else is refused with the usage line
 * @param {{ op?: string, url?: string, deployment?: string, cwd?: string, env?: NodeJS.ProcessEnv, out: (secret: string) => void, err: (line: string) => void }} options
 * @returns {0 | 1 | 2} 0 once the secret is set and handed out, 2 for a refusal that changed
 *   nothing, 1 for a command that failed
 */
export function changeSecret(
  action,
  { op, url, deployment = "the deployment", cwd = packageRoot, env = process.env, out, err },
) {
  if (!ACTIONS.includes(action)) {
    err(USAGE);
    return 2;
  }
  let vault;
  let item;
  if (op !== undefined) {
    const ref = OP_REF.exec(op);
    if (!ref) {
      err(`--op is op://<vault>/<item>, not "${op}"`);
      return 2;
    }
    if (action === "revoke") {
      err("revoke hands the secret to nobody, so it takes no --op");
      return 2;
    }
    [, vault, item] = ref;
  }

  // Names only: the value of what is there is never read.
  const listed = convexSync(["env", "list", "--names-only"], { cwd, env });
  if (listed.status !== 0) {
    err("convex env list failed; nothing changed");
    indented(said(listed), err);
    return 1;
  }
  const has = listed.stdout.split("\n").some((line) => line.trim() === NAME);
  if (action === "new" && has) {
    err(`${deployment} already has a ${NAME}; nothing changed. rotate replaces it`);
    return 2;
  }
  if (action === "rotate" && !has) {
    err(`${deployment} has no ${NAME}, so it is open to anyone with its URL; new sets the first`);
    return 2;
  }

  let exists = false;
  /** The item as `op item get` printed it, when it exists: every field, values and all. */
  let current;
  if (op !== undefined) {
    const items = spawnSync("op", ["item", "list", "--vault", vault, "--format", "json"], {
      env,
      encoding: "utf8",
    });
    if (items.status !== 0) {
      err("op item list failed; nothing changed");
      indented(said(items), err);
      return 1;
    }
    let listedItems;
    try {
      listedItems = JSON.parse(items.stdout);
    } catch {
      err("op item list printed no JSON; nothing changed");
      return 1;
    }
    exists = listedItems.some((entry) => entry.title === item);
    // A programming error rather than a refusal, so it throws, and before anything changes.
    if (!exists && url === undefined)
      throw new Error("changeSecret creates a 1Password item only with the deployment's url");
    if (exists) {
      const got = spawnSync("op", ["item", "get", item, "--vault", vault, "--format", "json"], {
        env,
        encoding: "utf8",
      });
      if (got.status !== 0) {
        err("op item get failed; nothing changed");
        indented(said(got), err);
        return 1;
      }
      try {
        current = JSON.parse(got.stdout);
      } catch {
        err("op item get printed no JSON; nothing changed");
        return 1;
      }
    }
  }

  const value = randomBytes(32).toString("base64");
  const strike = (text) => text.split(value).join("[secret]");

  const set = convexSync(["env", "set", NAME], { cwd, env, input: value });
  if (set.status !== 0) {
    err(`convex env set failed; ${deployment}'s secret is as it was`);
    indented(strike(`${set.stdout ?? ""}${said(set)}`), err);
    return 1;
  }

  if (action === "revoke") {
    err(`revoked: ${deployment} holds a secret nobody has, and refuses every machine until rotate`);
    return 0;
  }

  const next = (command) =>
    action === "new"
      ? `a machine sets up with: cn init --name <name> --url ${url ?? "<url>"} --secret-cmd '${command}'`
      : "every machine is refused until it runs cn init --refresh";

  if (op === undefined) {
    out(value);
    err("the secret is on stdout, once, and nowhere else");
    err(next("<the command that prints it>"));
    return 0;
  }

  const verb = exists ? "edit" : "create";
  const secretField = { label: "secret", type: "CONCEALED", value };
  const fields = exists ? (current.fields ?? []) : [];
  const body = exists
    ? {
        ...current,
        fields: fields.some((f) => f.label === "secret")
          ? fields.map((f) => (f.label === "secret" ? { ...f, ...secretField } : f))
          : [...fields, secretField],
      }
    : {
        title: item,
        category: "SECURE_NOTE",
        fields: [{ label: "url", type: "URL", value: url }, secretField],
      };
  const args = exists
    ? ["item", "edit", item, "--vault", vault]
    : ["item", "create", "--vault", vault];
  const stored = spawnSync("op", args, { env, encoding: "utf8", input: JSON.stringify(body) });
  if (stored.status !== 0) {
    err(
      `op item ${verb} failed: ${deployment} now holds a secret nobody has, as after revoke; rotate --op ${op} hands out a fresh one`,
    );
    indented(strike(said(stored)), err);
    return 1;
  }
  err(`the secret is in the secret field of "${item}" in ${vault}, and nowhere else`);
  err(next(`op read "op://${vault}/${item}/secret"`));
  return 0;
}

/** The command line, `.env.cloud.local` read, and `changeSecret` against the cloud deployment. */
function main(argv) {
  // vp hands on the `--` that separates its own flags from the script's.
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: { op: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    process.stderr.write(`${e.message}\n${USAGE}\n`);
    return 2;
  }
  const [action, ...rest] = parsed.positionals;
  if (action === undefined || rest.length > 0 || !ACTIONS.includes(action)) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  const file = join(packageRoot, ".env.cloud.local");
  const deployment = valueIn(file, "CONVEX_DEPLOYMENT");
  const url = valueIn(file, "CONVEX_URL");
  for (const [name, value] of [
    ["CONVEX_DEPLOYMENT", deployment],
    ["CONVEX_URL", url],
  ]) {
    if (value === undefined) {
      process.stderr.write(`.env.cloud.local names no ${name}\n`);
      return 1;
    }
  }

  const restore = holdEnvLocal();
  process.on("exit", restore);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(1));
  return changeSecret(action, {
    op: parsed.values.op,
    url,
    deployment,
    env: { ...process.env, CONVEX_DEPLOYMENT: deployment },
    out: (secret) => process.stdout.write(`${secret}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
