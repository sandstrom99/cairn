---
description: "Set cairn up with the person: stand a company's deployment up when there is none, set this machine up for it, and wire a repository so its sessions open on it."
argument-hint: "[deployment url, or the repository to wire]"
allowed-tools: Bash(cn:*)
---

Three things make a repository's sessions open on its company's worklist, and each is
done once: a deployment for the company, this machine set up for it, and the repository
wired to it. Work out which are done, say so in a line each, and do the rest in order.
You run every command. The person names things, finishes a browser login and unlocks
their password manager, and nothing else: never ask them to run or paste a command.

Run `cn doctor` first. Everything below that is not `cn` runs from the cairn checkout,
the directory `cn` is installed from: `readlink -f "$(command -v cn)"` prints
`<checkout>/packages/cli/bin/cn`. With no `cn` on PATH at all, install it with the person
the way the checkout's README says under "Install `cn`", in the checkout that
`claude plugin marketplace list` shows as the `cairn` source, and ask before writing
anything outside it.

The repository is the one this session is in, unless the arguments or the person name
another. The cairn checkout is wired already, so from there it is always another: ask
which.

## 1. A deployment for the company

When the repository's settings already name one in `CAIRN_DEPLOYMENT`, or the person says
the company has a deployment, this part is done. Its URL is the arguments, a cairn
deployment URL in the repository's `CLAUDE.md`, `AGENTS.md` or `README`, or the person's
answer, and part 2 takes it. A machine can hold several companies' deployments, so one that
`cn doctor` reaches is not proof that this repository's company has one: ask when it is not
clear whose work the repository is.

Otherwise offer to stand one up, and do it with them.

1. **Say what Convex is** before asking anything, in plain words. cairn keeps the worklist
   on Convex, a hosted database that runs cairn's functions. There is an account, made at
   the first login in the browser; a team the account belongs to, which that first login
   makes in the person's name; a project in the team for this company's worklist; and one
   deployment in the project, the running database `cn` talks to. cairn uses the project's
   development deployment, which the login alone can push to. A production one would need
   a deploy key and gives a worklist nothing more. A worklist sits well inside Convex's
   free plan: it is one of the 40 deployments a team on that plan has room for, and every
   deployment already in the team counts against the same 40, preview and sandbox ones
   included. https://www.convex.dev/pricing has the limits.
2. **Log in.** From `<checkout>/backend`, run `npx convex login status`. When it says
   `Not logged in`, run
   `CONVEX_ALLOW_ANONYMOUS=false npx convex login --device-name <this machine's hostname> --no-open --login-flow poll --accept-opt-ins`
   in the background, since it waits for the browser. The variable stops convex offering,
   after the login, to link the local deployment `backend/` runs on into the account: with
   no terminal that offer fails the command although the login landed, and a yes to it
   would rebind `backend/.env.local`. Read the link and the code it
   prints from its output. Hand both to the person: open the link, check the code matches,
   finish the login. That creates the account when there is none, and accepts Convex's
   terms. Wait for it to exit 0, then run `npx convex login status` again: it lists the
   teams.
3. **Name things**, in one round:
   - the deployment's name: a short lowercase word for whose worklist it is, usually the
     company, in letters, digits and dashes. Every machine's `cn init` uses it, and so does
     a repository's `CAIRN_DEPLOYMENT`;
   - the team, only when `npx convex login status` listed more than one;
   - the Convex project, `cairn-<name>` unless they want another;
   - the 1Password vault the secret goes in: their own for a worklist only they use, a
     shared one when colleagues will join. The secret passes through 1Password and never
     through this conversation. With no `op` on PATH, stop here and point the person at
     the README's "A deployment for a company", which they walk in their own terminal.
4. From the checkout's root, run `vp run @cairn/backend#new:cloud -- <name> --project <project>`,
   or `vp run @cairn/backend#new:cloud -- <name> --project <project> --team <team>` when a
   team was named. It creates the project and its development deployment with nothing
   running on it yet, writes `backend/.env.cloud.<name>.local`, which binds this checkout's
   cloud commands to it, and leaves `backend/.env.local` as it was.
5. `vp run @cairn/backend#secret -- new <name> --op "op://<vault>/cairn <name> deployment"`.
   It sets the deployment's secret before any function exists there, stores it in a
   1Password item with the URL beside it, and prints the `cn init --name …` line every
   machine sets up with. The secret itself is never printed. When `op` fails with
   `account is not signed in` or `authorization timeout`, 1Password is locked: ask the
   person to unlock it, and run the same command again.
6. `vp run @cairn/backend#push:cloud -- <name>`: the functions, then the page, which is
   then at `https://<deployment>.convex.site`.

## 2. This machine

Done when `cn doctor` ends `✓ secret accepted by <name>`, with `CAIRN_DEPLOYMENT=<name>`
in front of it when the machine holds more than one deployment.

A deployment part 1 just stood up printed its line, `cn init --name <name> --url <url> --secret-cmd '<command>'`.
For one that already existed, the secret is the person's to point at: ask for the command
that prints it (`op read "op://<vault>/<item>/secret"` is the usual shape), or whether the
deployment has none. Ask for the command, never for the secret itself, and do not run it:
`cn init` runs it once and never prints what it printed. When `CAIRN_DEPLOYMENT` is set,
the repository has already named the deployment: that is the name, and it stays out of
`--default`, so the machine's default is left where it is.

Ask in the same round what this machine can do, offering what you can see: `xcodebuild`
is `ios`, an Android SDK or `adb` is `android`, a browser or a node toolchain is `web`, an
attached phone is `device`. `decision` is a person's capability and never a machine's, so
it is not one of the answers.

Then `cn init --name <name> --url <url> --secret-cmd '<command>' --can <cap>…`, then
`cn doctor`. The first deployment on a machine becomes its default. A second leaves the
default where it is, and the repository names it instead (part 3).

A refused secret or a deployment that does not answer writes nothing at all, so fix the
input and run the same command again. A secret command that fails with `account is not
signed in` or `authorization timeout` means 1Password is locked: ask the person to unlock
it, and run the same `cn init` again. A secret that worked and is now refused means the
deployment's secret was rotated: run `cn init --refresh`, not a new `cn init`, and it
re-runs the command this machine stored and rewrites that one secret. A name that is
taken means this machine is already set up for that deployment: read `cn doctor` before
anything else. Never read or edit the config file by hand. It holds the secrets, and
`cn doctor` says everything in it that you need.

## 3. The repository

Done when a session started there opens with the deployment's brief: the check at the end
of this part. Every `cn` call about the deployment in this sitting carries
`CAIRN_DEPLOYMENT=<name>` in front of it, since this session's environment was set before
the repository named it.

1. **The marketplace, once per machine.** Run `claude plugin marketplace list`, and when it
   has no `cairn`, `claude plugin marketplace add <checkout>`. That registers the checkout
   with this machine's Claude Code, so a repository enables the plugin by name and carries
   no path that is true of one machine only.
2. **The settings file.** Ask whether everyone who opens this repository uses cairn. If
   they do, it is `.claude/settings.json`, which is tracked, so every clone opens on the
   deployment. If not, or not yet, it is `.claude/settings.local.json`, this machine's
   alone. Say which you chose and why. Into it goes `"enabledPlugins": { "cairn@cairn": true }`
   and `"env": { "CAIRN_DEPLOYMENT": "<name>" }`, merged with what is there and changing
   nothing else. That value is a name from each machine's config, never a URL or a secret,
   and nothing this sitting writes into the repository, tracked or not, holds a secret.
   - **Never print a settings file**, this one or `~/.claude/settings.json`: no `cat`, no
     reading it whole, no `grep` that shows a value. Its `env` is where people keep API
     keys, and a key printed once stays in the transcript. Merge with this, from the
     repository's root, which prints the names of what the file holds and never a value:

     ```bash
     node -e '
     const fs = require("fs"), path = require("path");
     const [given, name] = process.argv.slice(1);
     const file = fs.existsSync(given) ? fs.realpathSync(given) : given;
     const s = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
     s.enabledPlugins = { ...s.enabledPlugins, "cairn@cairn": true };
     s.env = { ...s.env, CAIRN_DEPLOYMENT: name };
     fs.mkdirSync(path.dirname(file), { recursive: true });
     fs.writeFileSync(file, JSON.stringify(s, null, 2) + "\n");
     console.log(`wrote ${file}\nkeys: ${Object.keys(s).join(", ")}\nenv: ${Object.keys(s.env).join(", ")}\nplugins: ${JSON.stringify(s.enabledPlugins)}`);
     ' .claude/settings.local.json <name>
     ```

     `.claude/settings.json` in place of the path for a tracked file. Every key and `env`
     name that was there before is still listed, and step 5 reads the repository's plugins
     from the last line. For `~/.claude/settings.json`'s plugins,
     `node -p 'JSON.stringify(require(process.argv[1]).enabledPlugins ?? {})' ~/.claude/settings.json`.
     Claude Code keeps its own diff of a file a command changes, the lines around the
     change included, when git could see that file as the session began. An ignored
     settings file gets none. When `git check-ignore` below finds the file was not ignored
     and the merge's `env` line names what look like keys, tell the person: those lines
     are in this session's transcript, and the file was one `git add` from a commit.
   - When the file is a symlink, as in a checkout whose worktrees share one, the script
     writes the file it points to, and its first line names that file.
   - A machine-local file has to be ignored by git. When `git check-ignore -q <file>`
     fails, add its path to the file `git rev-parse --git-path info/exclude` prints, never
     to the tracked `.gitignore`.
3. **Projects.** Run `CAIRN_DEPLOYMENT=<name> cn project list` for what the deployment has.
   Propose projects from the repository's layout, and keep them coarse: one per thing the
   repository ships, not one per directory. An app and its backend are one project, and a
   repository is often one project. A slug is one to sixteen lowercase letters and digits,
   starting with a letter, not `ep` or `bl`. Every issue id carries it, so nothing renames
   one: settle them with the person before creating any. Then run
   `CAIRN_DEPLOYMENT=<name> cn project new <slug> --name "<what it covers>"` for each one
   they keep that the deployment does not have yet.
4. **The cairn section** goes in `CLAUDE.md` beside a tracked settings file, or in
   `CLAUDE.local.md` beside a machine-local one, ignored by git the same way and written
   through a symlink the same way. The skill reads it to pick `--project`:

   ```markdown
   ## cairn

   Work in this repository is tracked in cairn, on the deployment `<name>`. An issue
   files under the project that owns the part of the repository it touches:

   | Project | Covers |
   |---|---|
   | `<slug>` | `<dir>/`, `<dir>/`: <what it is> |
   ```
5. **Another tracker.** Look for one:
   - a `.beads/` directory;
   - a beads plugin in the `enabledPlugins` of the repository's settings or of
     `~/.claude/settings.json`, read the two ways step 2 gives, never by printing either;
   - `bd` in the repository's `CLAUDE.md`, `AGENTS.md` or hooks;
   - a `TODO` file.

   Name what you find, and what turning it off would mean. For a plugin, that is `false`
   under its name in the same settings file as cairn's, which leaves its data where it is.
   Turn off only what the person says to. Moving its issues into cairn is a piece of work
   of its own. GitHub Issues stay as they are, since cairn never reads or mirrors them.

   When one stays on, ask which of the two gets new work: otherwise the repository tells
   every session to use both, and each tracker's own instructions say it is the only one.
   Write the answer as the last line of the cairn section, in the person's terms, such as
   `New work goes to cairn; beads keeps only what has not moved yet.`
6. **The check.** Start a session in the repository and show the person the brief it
   opened with. From the repository's root, run
   `claude -p "Reply with the word ok." --output-format stream-json --verbose --include-hook-events --max-turns 1`.
   Every hook it runs prints a `system` event with `subtype` `hook_response`; the brief is
   the `stdout` of the one whose `hook_event` is `SessionStart` and whose `stdout` opens
   `cairn · <name>`. A brief from another deployment, or none, means a step above did not
   land, and the settings file is the first place to look.

The last reply names every file written, each marked tracked or machine-local: the
settings file, the cairn section, `info/exclude` when it changed, and this machine's own,
meaning the marketplace in `~/.claude` and the config `cn init` wrote. It also names the
projects created, and any tracker found, left on or turned off, and for one left on, which
gets new work. Sessions already open in
the repository keep what they started with until they restart.
