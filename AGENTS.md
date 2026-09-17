# Working in cairn

Read `docs/design.md` first. It is the design, and every decision in it is a
decision. A change that contradicts it changes the document in the same pull
request, or does not happen.

## What this is

An agent worklist on Convex. One deployment per company, a `cn` CLI over typed
Convex calls, and a Claude Code plugin that teaches agents to use it. Tasks
only: not a wiki, not a knowledge base, not an orchestrator.

## Layout

| Path | Package | Holds |
|---|---|---|
| `backend/convex/` | `@cairn/backend` | schema, functions, tests. `_generated/` is committed and never hand-edited. |
| `packages/cli/` | `@cairn/cli` | `cn`. `src/verbs/` is one file per verb, `src/lib/` the shell they run in. |
| `plugins/cairn/` | | the skill, the SessionStart hook, the slash commands. |
| `docs/` | | `design.md`, and `dogfood.md` until `cn create` exists. |
| `apps/` | | reserved; in the workspace globs, nothing in it. |

## Toolchain: vp, only

| Do | Not |
|---|---|
| `vp install` | `pnpm install`, `npm install` |
| `vp check` before every commit, `vp check --fix` for formatting | prettier, eslint, a bare `tsc` |
| `vp run -r test`, or `vp run @cairn/cli#test` for one package | `npx vitest` |
| `vp run @cairn/backend#dev` for the Convex dev loop | |
| `vp run codegen` after a schema or function change | editing `_generated/` |

Node 24 comes from `.node-version`. vite-plus is pinned to the global binary's
version in `pnpm-workspace.yaml`; the reason is in `docs/design.md` §11, and the
two move together.

## Rules that hold from the first line

- **A verb is one Convex function** plus formatting. The CLI never decides. If a
  verb needs logic, the logic goes in `backend/convex/` and gets a test there.
- **The reference form.** Every output line, journal entry, commit and reply that
  names an issue or epic uses `app-14 "fix connection retry"`. It is spelled in
  one place, `ref()` in `packages/cli/src/lib/ref.mts`.
- **`.mts`, an extension on every import, erasable syntax only** in
  `packages/cli`. Node strips the types; nothing is built.
- **Every read verb takes `--json`.** stdout is the answer; `say` and `warn` go
  to stderr.
- **A verb's file header is its `--help`.** Write the contract first, then the
  verb.
- **Mutable writes carry `revision`. Journal entries are inserts.**
- **`epicId` is required. Closing takes a verification record.**

## Local deployment

`CONVEX_AGENT_MODE=anonymous npx convex dev` in `backend/` runs a local Convex
with no account and writes `backend/.env.local`, which is gitignored.
`convex codegen` refuses to run without a deployment, so this is also how
`_generated/` is refreshed offline. `cn` reaches it with
`CAIRN_URL=http://127.0.0.1:3210`.

## Commits and pull requests

Conventional Commits, and the pull request title is the squash-merge subject.
Scopes here: `backend`, `cli`, `plugin`, `docs`, `tooling`.

## Dogfood

The moment `cn create` works, the issues in `docs/dogfood.md` go in, and every
task after that is a cairn issue in cairn. Until then, what to do next is
written there.
