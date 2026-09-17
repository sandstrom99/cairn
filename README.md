# cairn

An agent worklist built on Convex: task and project state that survives a
session, is shared by every agent and every machine, and has no sync layer
because there is nothing to sync.

A cairn is the stack of stones a previous traveller leaves to mark the route for
whoever comes next. That is what task state outliving a session actually is: not
a database, a marker left for the next agent saying the way goes here.

**Status: skeleton built, nothing domain-specific yet.** The design is settled:
read [`docs/design.md`](docs/design.md) before writing any code. It carries every
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
| Surface | One `cn` CLI over typed Convex calls, and a Claude Code plugin that teaches it. No MCP server |
| References | `app-14 "fix connection retry"`: id and title, every time, everywhere |
| Ids | `app-14`, `web-22`, minted server-side in a transaction |
| Readiness | `blocks`, `blocked-by`, `defer-until`. Computed live: no denormalised flag, no recompute command |
| Statuses | `open`, `in_progress`, `closed`, `dropped`. Blocked is derived, never stored |
| Human waits | A first-class `blockers` table. Agents raise them and may never resolve them |
| Hygiene | `epicId` is non-null, closing takes a verification record, and reconcile drains the rest |
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

## Layout

```
backend/convex/         schema, queries, mutations, tests      @cairn/backend
packages/cli/           cn, no build step                       @cairn/cli
plugins/cairn/          the Claude Code plugin: skill, hook, commands
docs/design.md          the design
```

## Run it

```bash
curl -fsSL https://vite.plus | bash        # once per machine: vp, and the Node it needs
vp install                                 # once per checkout
vp config                                  # once per checkout: the pre-commit hook
vp run verify                              # format, lint, types, every test: about a second
ln -s "$PWD/packages/cli/bin/cn" ~/.local/bin/cn
cn doctor
```

A local Convex deployment, no account needed:

```bash
vp run @cairn/backend#dev:local
```

## First slice

`schema · create · list · ready · close · journal · show`, then dogfood within
days on cairn's own construction. Invyte comes after it is mature. Order of
magnitude 2–5k lines.
