# Installing cairn by hand

The setup prompt in the [README](../README.md#get-started) has Claude walk you through
these steps. This page is the same thing by hand, and the reference for updating an
install, rotating a deployment's secret and trying cairn with no account.

Five steps, in the order you run them. The first gives you `cn`; the second
stands up a deployment of your own, once per company; the third points this machine at
it; the fourth makes every Claude Code session in a repository open with the worklist in
front of it; the fifth is the window for a person. `/cairn:init` walks steps 2 to 4 with
you from any Claude Code session that has the plugin, and the text below is the same thing
by hand.

## 1. Install `cn`

Nothing is built: a clone is the install. `cn` runs its TypeScript source
under Node 24, which strips the types itself, and `vp` (vite-plus) brings that
Node with it.

The install is a clone of its own, kept at `main` and never worked in. Every
repository's sessions run what it holds, `cn` from its `packages/cli` and the plugin
from its `plugins/cairn` (step 4), so a branch checked out there would reach all of
them at once.

```bash
curl -fsSL https://vite.plus | bash                   # once per machine: vp, and its Node
git clone https://github.com/sandstrom99/cairn ~/.local/share/cairn
cd ~/.local/share/cairn && vp install
ln -s "$PWD/packages/cli/bin/cn" ~/.local/bin/cn      # or anywhere else on PATH
cn --help
```

The installer puts `vp` in `~/.vite-plus` and appends a line sourcing
`~/.vite-plus/env` to your shell's startup files: vite-plus 1.0.0 wrote it to `~/.zshenv`,
`~/.profile` and `~/.bash_profile`. Where your dotfiles are managed, move that line into
them. The installer gives you the
latest `vp`, which is fine: the repository pins its own vite-plus, and `vp` runs that
copy inside it. `vp --version` lists both.

To take what has merged since, from inside it: `git pull --ff-only && vp install`, and
then the deployment's push, as [Updating](#updating) says.
Work on cairn itself happens in another clone and its worktrees, as `AGENTS.md` says.

## 2. A deployment of your own

A company that has no worklist yet gets one once, from a machine with the install. The
commands below run inside it, so the files they leave beside it are the install's, and a
push from it pushes main.

cairn keeps the worklist on Convex, a hosted database that runs cairn's functions, and
four things there matter: an account, made at the first login; a team the account
belongs to, which that first login makes in your name; a project in the team, one per
company's worklist; and a deployment in the project, the running database `cn` talks to.
A project has a development deployment and a production one. cairn uses the development
one, which your login alone can push to. The production one would need `convex deploy`
and a deploy key, and gives a worklist nothing more. A worklist sits well inside
Convex's free plan: it is one of the 40 deployments a team on that plan has room for,
and every deployment already in the team counts against the same 40, preview and
sandbox ones included. https://www.convex.dev/pricing has the limits.

Log in once per machine, in your own terminal, since it finishes in the browser:

```bash
cd ~/.local/share/cairn/backend && CONVEX_ALLOW_ANONYMOUS=false npx convex login
```

The variable stops convex offering, after the login, to link the local deployment
`backend/` runs on into your account, which would rebind `backend/.env.local` to it.

Then, from the install's root, make the deployment. `acme` is the name `cn init` will
give it, lowercase letters, digits and dashes:

```bash
cd ~/.local/share/cairn
vp run -F @cairn/backend new:cloud -- acme
```

It creates the Convex project `cairn-acme` with its development deployment, and writes
`backend/.env.cloud.acme.local`, which is gitignored and binds the install's cloud
commands to that deployment. `backend/.env.local` stays as it was. `--team <team>` picks
the team when the account has more than one, which `npx convex login status` lists, and
`--project <project>` names the Convex project something other than `cairn-acme`.

Nothing runs on the deployment yet. A deployment with no secret answers anyone who has
its URL, so the secret goes on first, and then the functions and the page. The secret
goes to exactly one place, and you choose which: a 1Password item, which every machine
with access to the vault reads, or a file on this machine, which you hand to another
machine yourself. Either way it is never on the terminal.

With 1Password, the script creates the item with the fields `url` and `secret`:

```bash
vp run -F @cairn/backend secret -- new acme --op "op://<vault>/cairn acme deployment"
```

It prints the `cn init --name acme …` line, its `--secret-cmd` reading the item: run it
on this machine in step 3, and on every other machine that joins.

Without 1Password, the script puts the secret on stdout, once, and it goes straight into
a file only you can read:

```bash
mkdir -p ~/.config/cairn
(umask 077 && node backend/scripts/secret.mjs new acme > ~/.config/cairn/acme.secret.new) \
  && mv ~/.config/cairn/acme.secret.new ~/.config/cairn/acme.secret
```

It runs the script with `node` rather than `vp run`, because vp prints its own command
line on stdout first, which would land in the file beside the secret. The file moves into
place only when the script succeeded, so a `new` that is refused, as a second one is,
never empties a file that holds the secret. The secret goes to that file and nowhere else. The script prints the `cn init --name acme …` line on the
terminal with a placeholder for `--secret-cmd`; this machine's command is
`cat ~/.config/cairn/acme.secret`, and step 3 shows the line with it in place. Another
machine that joins gets the secret from you through whatever you already share secrets
with, saves it, and only it, to the same path with mode 600, and runs the same `cn init`.
Any command whose stdout is the secret works in its place: a keychain
(`security find-generic-password -s cairn-acme -w` on macOS), `pass`, or an environment
variable.

Then push the functions and the page:

```bash
vp run -F @cairn/backend push:cloud -- acme
```

The page is then at the deployment's URL with `.convex.cloud` changed to `.convex.site`,
the region kept: `https://happy-otter-123.eu-west-1.convex.site` for
`https://happy-otter-123.eu-west-1.convex.cloud`. Dropping the region gives a 404.

An install that keeps several deployments, one file each, pushes every one of them
with a bare `vp run -F @cairn/backend push:cloud`, so a backend change reaches every
company's worklist, and names one after `--` to push only that one.

A bare `npx convex` in `backend/` rebinds `.env.local` to whatever it last talked to;
the next `vp run -F @cairn/backend …` puts it back and says so.

Rotating replaces the secret, and then each machine runs `cn init --refresh`, which runs
the command it stored at setup again. With 1Password:

```bash
vp run -F @cairn/backend secret -- rotate acme --op "op://<vault>/cairn acme deployment"
cn init --refresh
```

With a file, the new secret goes to a new file that moves into place only when the
rotate succeeded, so a refused rotate never empties the old one:

```bash
(umask 077 && node backend/scripts/secret.mjs rotate acme > ~/.config/cairn/acme.secret.new) \
  && mv ~/.config/cairn/acme.secret.new ~/.config/cairn/acme.secret
cn init --refresh
```

Every other machine takes the new secret from you into its own file the same way, and
runs `cn init --refresh`.

Revoking is `vp run -F @cairn/backend secret -- revoke acme`, which fences the deployment
with a secret nobody holds until the next rotate. `convex env remove CAIRN_SECRET` would
open it to anyone with the URL, so never that. One shared secret cannot shut out one
machine: a rotate shuts out all of them, and each that should be back runs
`cn init --refresh`.

## 3. Point this machine at it: `cn init`

A worklist is one Convex deployment per company, fenced by one shared secret,
`CAIRN_SECRET` in the deployment's environment. Nothing about it is in the
checkout, so each machine is told once. With the secret in 1Password:

```bash
cn init --name acme --url https://<deployment>.convex.cloud \
  --secret-cmd 'op read "op://<vault>/cairn acme deployment/secret"' \
  --host harbor-mac
cn doctor
```

With the secret in a file:

```bash
cn init --name acme --url https://<deployment>.convex.cloud \
  --secret-cmd 'cat ~/.config/cairn/acme.secret' \
  --host harbor-mac
cn doctor
```

The URL is the one the line from step 2 printed. `--secret-cmd` is any command whose
stdout is the secret. `cn init` runs it once, here, and never prints what it printed, so
the secret is not an argument, not in a shell history and not in an agent's transcript.
`--host` is
what this machine is called on every claim and journal entry, `harbor-mac/claude` for an
agent on Harbor's Mac. cairn runs on trust, so that name is also what tells your agents from
a colleague's: give it your name as well as the machine's. Nothing checks it. Without it,
cn takes the OS hostname up to its first dot, lowercased, so a Mac called
`Harbors-MacBook-Pro.local` is `harbors-macbook-pro`, which already carries it. The command
checks before it writes: the deployment has to answer and accept the secret, or nothing
is written and the line says what to fix. What it writes is
`~/.config/cairn/config.json`, which names the deployment and the command and never the
secret, and `~/.config/cairn/secrets/acme`, which is the secret alone; both mode 600.

`cn doctor` is green when it shows the deployment answering and
`✓ secret accepted by acme`. Its `✓ page …` line is where this deployment's page is,
which a machine that joined learns nowhere else. From then on every verb resolves to that deployment.
`CAIRN_URL` and `CAIRN_SECRET` in the environment override the file, which is the
way in for a CI runner or a one-off. `cn init --help` is the whole contract.

A machine with more than one deployment picks one per repository:
`CAIRN_DEPLOYMENT=<name>` in the `env` of the repository's `.claude/settings.json`,
or of its `settings.local.json` when the choice is this machine's alone, and every
session there, its hooks included, resolves to that deployment. It is a name from
the config, never a URL or a secret. `cn doctor` says whether `CAIRN_URL`,
`CAIRN_DEPLOYMENT` or the default chose.

## 4. Enable the plugin

The repo root is a Claude Code plugin marketplace
(`.claude-plugin/marketplace.json`) listing `plugins/cairn`: the `cairn` skill,
a SessionStart hook that opens every session with `cn brief`, the under-20-line
situation report, a Stop hook that hands back one line when a session stops
holding a claim it has not journaled, and `/cairn:ready`, `/cairn:pick`,
`/cairn:handoff`, `/cairn:close`, `/cairn:review` and `/cairn:init`.

Register the install once per machine. The plugin loads in place from it, never from a
copy, so the next `git pull` there reaches every repository's next session:

```bash
claude plugin marketplace add ~/.local/share/cairn
```

Run again with another path, the same command moves the registration and keeps every
repository's `enabledPlugins`; `claude plugin marketplace remove` would take them out.

Then enable the plugin in each repository whose sessions should open on a worklist,
which is what `/cairn:init` does with you. It goes in the repository's
`.claude/settings.json`, which is tracked, when everyone who opens the repository uses
cairn, and in `.claude/settings.local.json`, this machine's alone, otherwise:

```json
{
  "enabledPlugins": { "cairn@cairn": true },
  "env": { "CAIRN_DEPLOYMENT": "acme" }
}
```

Then one `cn project new` for each thing the repository ships that the deployment does
not have yet, and a `## cairn` section in its `CLAUDE.md`, or in `CLAUDE.local.md` beside
a machine-local settings file, mapping the repository's directories to the deployment's
projects, drafted from `cn project list`. What a project is lives on the project, as its
description. The skill reads the section to pick `--project` for `cn create`, and
`cn project list` for work that fits none of its rows. cairn's own `CLAUDE.md` ends with
one.

On a machine where every repository is one company's, install the plugin at user scope
instead, and every session anywhere opens on the machine's default deployment:

```bash
claude plugin install cairn@cairn
```

This repository's own `.claude/settings.json` enables the plugin through
`extraKnownMarketplaces`, naming the checkout as a `directory` source of `"."`, which
works only inside cairn. Anywhere else that path is one machine's, which is why a
repository enables the plugin by name instead. On a machine that has registered the
install, the install wins even inside cairn and its worktrees, so cairn's own sessions
run main's plugin too. Either way, a project's settings need the folder's trust dialog
accepted once in an interactive `claude`.

The hooks do nothing until `cn` is on PATH. With `cn` installed and nothing
configured, a session opens with two lines pointing at `/cairn:init`, which does
steps 2, 3 and 4 together with the person, standing the company's deployment up first
when there is none: it asks for the command that prints the secret, never the secret,
and for what the machine can do. With a deployment configured
that does not answer, it opens with one line naming the deployment and `cn
doctor`, which says why. With a `CAIRN_DEPLOYMENT` this machine has not set up, it
opens with the one line `cn` fails with, naming the deployments the machine has and
the `cn init` that adds the missing one.

## 5. Open the page

`apps/web` is the window for a person: every row is one of `cn`'s lines, live
over a subscription, with the deployment's activity beside it. It is read-only
today. The deployment serves it itself: `vp run -F @cairn/backend push:cloud` pushes
the functions and then the page, built for that deployment, so it is at the
deployment's URL with `.convex.cloud` changed to `.convex.site`, region and all, on any
machine, a phone included. `cn doctor` prints it as its `✓ page …` line. It reads
nothing until the secret is pasted into it, once per browser, which keeps it. The
secret is what this machine's `--secret-cmd` prints; run that command yourself, in your
own terminal, to copy it.

To work on the page itself, run it from a dev server instead. Two lines in
`apps/web/.env.local`, which is gitignored:

```
VITE_CAIRN_URL=https://<deployment>.convex.cloud
CAIRN_SECRET=<the secret>
```

```bash
vp run dev:web
```

The dev server alone reads `CAIRN_SECRET`. A build, `vp run -F @cairn/web build`,
never carries it: the built page asks for it once and keeps it in that browser's
storage. With no `VITE_CAIRN_URL` the page talks to the anonymous local
deployment on port 3210.

## Updating

From inside the install, `git pull --ff-only && vp install` takes what has merged, and
`vp run -F @cairn/backend push:cloud` takes it to every deployment the install keeps. Do both
together: a `cn` and the functions it calls move as one, and `cn doctor` says when a
deployment runs functions older or newer than the `cn` asking.

**Once, for a deployment that ran cairn from before `b673ae2`** (2026-09-29). Issues then
stored `requires`, what a machine had to be able to do, and that went with machine
capabilities: main's schema has no such field, so Convex refuses the push over issues that
still carry it.

```
✖ Schema validation failed.
Document with ID "…" in table "issues" does not match the schema: Object contains extra field `requires` that is not in the validator.
```

Push `b673ae2`, the last commit that declares the field and carries the one-off that
strips it, run the one-off, and push main:

```bash
git checkout b673ae2 && vp install && vp run -F @cairn/backend push:cloud -- acme
(cd backend && npx convex run --env-file .env.cloud.acme.local patch:dropRequires)
git checkout main && vp install && vp run -F @cairn/backend push:cloud -- acme
```

The one-off answers `{ "issues": N, "stripped": N }`, and run again, `"stripped": 0`. It
changes nothing anyone reads, and it writes no event.

## Trying it with no account

A local deployment needs no Convex account. From the install, in a terminal of its own:

```bash
cd ~/.local/share/cairn && vp run -F @cairn/backend dev
```

That runs an anonymous deployment at `http://127.0.0.1:3210` and pushes cairn's functions
to it. In another terminal, point this machine at it, with no secret, since a local
deployment has none, and open the page:

```bash
cn init --name local --url http://127.0.0.1:3210
cd ~/.local/share/cairn && vp run dev:web
```

It lives on this machine only, and answers only while that first terminal runs.

