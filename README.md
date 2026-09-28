# cairn

An agent worklist built on Convex: task and project state that survives a
session, is shared by every agent and every machine, and has no sync layer
because there is nothing to sync.

A cairn is the stack of stones a previous traveller leaves to mark the route for
whoever comes next. That is what task state outliving a session actually is: not
a database, a marker left for the next agent saying the way goes here.

**Status: in use on its own construction since 2026-09-17.** Every verb in
[`docs/design.md` §10](docs/design.md) exists, cairn's own worklist lives in
cairn, the plugin runs in this repo, and the web window is read-only. The design
is settled: read `docs/design.md` before writing any code. It carries every
decision, what was deliberately left open, and the measurements behind both.
Agents working in this repo start at [`AGENTS.md`](AGENTS.md).

---

## The shape, in one screen

```
epic  "Ship invite links"              ← the human view, spans projects
 ├── issue  add share sheet               [app]
 ├── issue  /invite landing page          [web]
 └── issue  invite audit log              [admin]
```

An epic is an outcome, not a place. `project` is a field on the issue.

| | |
|---|---|
| Store | One Convex deployment per company. No replicas, so no merge, so nothing to reconcile |
| Surface | One `cn` CLI over typed Convex calls, a Claude Code plugin that teaches it, and a web window that prints the same lines. No MCP server |
| References | `app-14 "fix connection retry"`: id and title, every time, everywhere |
| Ids | `app-14`, `web-22`, minted server-side in a transaction |
| Readiness | `blocks`, `blocked-by`, `defer-until`. Computed live: no denormalised flag, no recompute command |
| Statuses | `open`, `in_progress`, `closed`, `dropped`. Blocked is derived, never stored |
| Human waits | A first-class `blockers` table. Agents raise them, and end them only on the person's word, which the record quotes |
| Hygiene | `epicId` is non-null, closing takes a verification record, the facts are checked where they are made (`cn close` spawns the follow-up an unverified close owes and offers the epic close; `cn create` hands back near-identical titles), and `cn review <epic>` lists what a person and an agent look at together. Nothing runs on its own |
| Scope | Tasks only. Not a wiki, not a knowledge base, not an orchestrator |

## Why not just keep beads

Every failure this setup hit with beads is downstream of one design choice:
**Dolt is a distributed version-controlled store.** Concurrent child ids collide
on an unmergeable counter, `bd close` lost 7 of 8 closes under agentic load, and
`--append-notes` persisted 3 of 16 writes. Those are not incidental bugs; they
are what a replicated merge-based store costs.

On one authoritative deployment they are categories that do not exist. The sync
layer is not built better; it is deleted.

The full measurement, 348k production Go lines, where the mass sits, and the
two beads bugs worth stealing the fix for, is in
[`docs/design.md` §15](docs/design.md).

## Getting onto it

Four steps, in the order a new machine walks them. The first two give you `cn`;
the third makes every Claude Code session open with the worklist in front of it;
the fourth is the window for a person.

### 1. Install `cn`

Nothing is built: the checkout is the install. `cn` runs its TypeScript source
under Node 24, which strips the types itself, and `vp` (vite-plus) brings that
Node with it.

```bash
curl -fsSL https://vite.plus | bash                 # once per machine: vp, and its Node
git clone https://github.com/sandstrom99/cairn ~/code/cairn
cd ~/code/cairn && vp install                       # once per checkout
ln -s "$PWD/packages/cli/bin/cn" ~/.local/bin/cn    # or anywhere else on PATH
cn --help
```

### 2. Point it at a deployment: `cn init`

A worklist is one Convex deployment per company, fenced by one shared secret,
`CAIRN_SECRET` in the deployment's environment. Nothing about it is in the
checkout, so each machine is told once:

```bash
cn init --name acme --url https://<deployment>.convex.cloud \
  --secret-cmd 'op read "op://<vault>/<item>/secret"' \
  --can web android
cn doctor
```

`--secret-cmd` is any command whose stdout is the secret. `cn init` runs it once,
here, and never prints what it printed, so the secret is not an argument, not in
a shell history and not in an agent's transcript. `--can` is what this machine
can build and run, from `ios`, `android`, `web` and `device`; it is what
`cn ready` marks work with, never a reason to hide it. The command checks before
it writes: the deployment has to answer and accept the secret, or nothing is
written and the line says what to fix. What it writes is
`~/.config/cairn/config.json`, mode 600.

`cn doctor` is green when its last two lines are the deployment answering and
`✓ secret accepted by acme`. From then on every verb resolves to that deployment.
`CAIRN_URL` and `CAIRN_SECRET` in the environment override the file, which is the
way in for a CI runner or a one-off. `cn init --help` is the whole contract.

A company that has no deployment yet stands one up once, from `backend/`, on a
machine with a Convex account:

```bash
cd backend
npx convex login                    # once per machine
npx convex dev --once               # creates the project on first run and writes .env.local
```

Copy the `CONVEX_DEPLOYMENT` and `CONVEX_URL` lines it wrote into
`backend/.env.cloud.local`, which is gitignored and is what binds this checkout's
cloud commands. Then give the deployment its secret, its functions and the page:

```bash
CONVEX_DEPLOYMENT=$(sed -n 's/^CONVEX_DEPLOYMENT=//p' .env.cloud.local) \
  npx convex env set CAIRN_SECRET "$(openssl rand -base64 32)"
cd .. && vp run @cairn/backend#push:cloud
```

Put the url and that secret in the company's password manager as one item, say
`cairn acme deployment` with fields `url` and `secret`, and every other machine
is the `cn init` above. A bare `npx convex` in `backend/` rebinds `.env.local`
to whatever it last talked to; the next `vp run @cairn/backend#…` puts it back
and says so.

### 3. Enable the plugin

The repo root is a Claude Code plugin marketplace
(`.claude-plugin/marketplace.json`) listing `plugins/cairn`: the `cairn` skill,
a SessionStart hook that opens every session with `cn brief`, the under-20-line
situation report, a Stop hook that hands back one line when a session stops
holding a claim it has not journaled, and `/cairn:ready`, `/cairn:pick`,
`/cairn:handoff`, `/cairn:close`, `/cairn:review` and `/cairn:init`.

```bash
claude plugin marketplace add ~/code/cairn
claude plugin install cairn@cairn
```

A repository can enable it for everyone who opens it instead, the way this one
does in `.claude/settings.json`: `extraKnownMarketplaces` naming the clone as a
`directory` source, and `enabledPlugins` with `cairn@cairn`. That needs the
folder's trust dialog accepted once in an interactive `claude`.

The hooks do nothing until `cn` is on PATH. With `cn` installed and nothing
configured, a session opens with two lines pointing at `/cairn:init`, which does
step 2 together with the person: it asks for the command that prints the secret,
never the secret, and for what the machine can do. With a deployment configured
that does not answer, it opens with one line naming the deployment and `cn
doctor`, which says why.

### 4. Open the page

`apps/web` is the window for a person: every row is one of `cn`'s lines, live
over a subscription, with the deployment's activity beside it. It is read-only
today. The deployment serves it itself: `vp run @cairn/backend#push:cloud` pushes
the functions and then the page, built for that deployment, so it is at
`https://<deployment>.convex.site` on any machine, a phone included. It reads
nothing until the secret is pasted into it, once per browser, which keeps it.

To work on the page itself, run it from a dev server instead. Two lines in
`apps/web/.env.local`, which is gitignored:

```
VITE_CAIRN_URL=https://<deployment>.convex.cloud
CAIRN_SECRET=<the secret>
```

```bash
vp run dev:web
```

The dev server alone reads `CAIRN_SECRET`. A build, `vp run @cairn/web#build`,
never carries it: the built page asks for it once and keeps it in that browser's
storage. With no `VITE_CAIRN_URL` the page talks to the anonymous local
deployment on port 3210.

## Working in the repo

```bash
vp config                          # once per clone: the pre-commit hook
vp run verify                      # format, lint, types, every test: about a second
vp run @cairn/backend#dev          # a local deployment, no account, in another terminal
```

`AGENTS.md` carries the rest: the per-change verification table, the toolchain
rules, and the loop every task in this repo runs through, which is `cn ready`
against cairn's own worklist.

## Layout

```
backend/convex/         schema, functions, tests; _generated/ is committed    @cairn/backend
backend/scripts/        the wrappers every convex command runs through: local, cloud, throwaway
packages/cli/           cn: one file per verb, no build step                  @cairn/cli
plugins/cairn/          the Claude Code plugin: skill, hooks, commands
apps/web/               the web window: Vite, React and convex/react          @cairn/web
scripts/                verify-e2e.mjs, the per-verb rows of AGENTS.md as one script
docs/design.md          the design
```

About 10,500 lines without tests and 17,500 with, measured 2026-09-22, against
the 2–5k the design estimated on 2026-09-17.
