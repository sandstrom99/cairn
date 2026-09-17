# Working in cairn

Read `docs/design.md` first. It is the design, and every decision in it is a
decision. A change that contradicts it changes the document in the same pull
request, or does not happen.

## What this is

An agent worklist on Convex. One deployment per company, a `cn` CLI over typed
Convex calls, and a Claude Code plugin that teaches agents to use it. Tasks
only: not a wiki, not a knowledge base, not an orchestrator.

## Verify a change

This section is the verification suite, at its start. It grows with the
project: every new verb, table or surface adds its row to the table below and,
where the unit tests cannot prove it, a command that runs it for real. Nothing
here is optional, and nothing gets removed because it became inconvenient.

One command, about a second, before you say anything works:

```bash
vp run verify        # vp check (format, lint, types), then every test
```

Green is exactly this, and nothing else counts:

```
pass: All N files are correctly formatted
pass: Found no warnings, lint errors, or type errors in N files
 Test Files  1 passed (1)        ← backend
 Test Files  5 passed (5)        ← cli
```

`vp check --fix` repairs formatting. Lint and type errors are yours to fix. The
gate is fast enough that scoping the check buys nothing (one file 1.1s, the
whole tree 0.9s); scope the tests only once the suite is slow, with
`vp run @cairn/cli#test` or `vp run @cairn/backend#test`.

Tests prove the unit. Depending on what changed, one more command proves the
change works where it runs:

| Changed | Also run | What it proves |
|---|---|---|
| `backend/convex/**` | `vp run @cairn/backend#verify` | the functions push to the configured deployment and pass Convex's own `tsc` |
| `packages/cli/**` | the verb, against a local deployment: `CAIRN_URL=http://127.0.0.1:3210 cn doctor` | it runs end to end, not only in a unit test |
| a verb's header | `cn <verb> --help` | the header reads as the contract it is |
| `plugins/cairn/**` | `bash plugins/cairn/hooks/session-start.sh` | silent or the brief, never an error |

A local deployment with no account, once, in another terminal:
`vp run @cairn/backend#dev:local`. It writes `backend/.env.local`, which is
gitignored, and after that `vp run @cairn/backend#verify` and `#dev` target it.

Three things enforce the gate, so a session cannot skip it by forgetting:

- **Pre-commit** runs `vp check --fix` on staged files. `vp config` arms it once
  per clone; the hook lives in `.vite-hooks/`, the rule in `vite.config.ts`.
- **A Claude Stop hook** refuses to end a turn while a changed file fails
  `vp check`, and hands the output back. Once; it does not loop.
- **CI** runs `vp check` and every test on push and pull request.

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
| `vp run verify`, or `vp check --fix` for formatting alone | prettier, eslint, a bare `tsc`, `npx vitest` |
| `vp run @cairn/backend#dev` for the Convex dev loop | |
| `vp run codegen` after a schema or function change | editing `_generated/` |
| `vp config` once per clone, for the pre-commit hook | |

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

## Commits and pull requests

Conventional Commits, and the pull request title is the squash-merge subject.
Scopes here: `backend`, `cli`, `plugin`, `docs`, `tooling`.

## Dogfood

The moment `cn create` works, the issues in `docs/dogfood.md` go in, and every
task after that is a cairn issue in cairn. Until then, what to do next is
written there.
