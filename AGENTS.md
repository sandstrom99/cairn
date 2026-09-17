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
 Test Files  13 passed (13)      ← backend
 Test Files  31 passed (31)      ← cli
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
| `backend/convex/lib/guard.ts` | `CAIRN_SECRET=wrong cn ready`, then `cn ready` | the cloud deployment refuses a wrong secret in one line naming the fix, and answers with the right one |
| `packages/cli/**` | the verb, against a local deployment: `CAIRN_URL=http://127.0.0.1:3210 cn doctor` | it runs end to end, not only in a unit test |
| a verb's header | `cn <verb> --help` | the header reads as the contract it is |
| `plugins/cairn/**` | `bash plugins/cairn/hooks/session-start.sh`, with `CAIRN_URL` set and with it unset, plus `claude plugin validate plugins/cairn --strict` | the brief with a deployment, nothing without, exit 0 both ways, and a manifest that validates |
| `.claude/settings.json` | `claude plugin details cairn@cairn` from the repo root | the inventory names the skill, the four commands and the SessionStart hook; it needs the folder's trust dialog accepted once in an interactive `claude`, before which project marketplaces are ignored without a message, and `claude plugin list` never shows a project-enabled plugin |
| `verbs/doctor.mts` | `cn doctor`, with nothing set in the environment | the last two lines are the deployment answering and `✓ secret accepted by cairn`, not only the config resolving |
| `verbs/project.mts` | `cn project new cn --name "cairn: backend, cli, plugin"`, then `cn project list` | a slug becomes an id prefix, and the list reads it back |
| `verbs/epic.mts` | `cn epic new "Create to close"`, then `cn epic list`, then `cn epic close ep-N --revision 0` with an open task | an epic mints `ep-N`, the list prints its health block, and closing over open work is refused naming it |
| `verbs/create.mts` | `cn create --project cn --epic ep-1 --title "…"`, and the same with no `--epic` | an issue mints in order; with no epic it exits 1 and lists the open ones |
| `verbs/list.mts` | `cn list --epic ep-1 --json` | priority then age, and `--json` carries id and title |
| `verbs/brief.mts` | `cn brief`, then `cn brief --can decision` | under 20 lines, counts and heads; the follow-ups line grows by what `--can` covers, and `cn ready` shows all of them marked |
| `verbs/ready.mts` | `cn ready`, then `cn ready --can web` | open unblocked work in priority order, and a row needing `ios` marked `· needs ios` rather than hidden |
| `verbs/show.mts` | `cn show cn-1`, then `cn show ep-1`, then `cn show cn-1 --history`, then `cn show bl-1` | the brief is an issue's neighbourhood, an epic's open issues, every event in order, and a blocker with what it holds |
| `verbs/claim.mts`, `verbs/release.mts` | `cn claim cn-2`, then `CAIRN_ACTOR=other/agent cn claim cn-2` | the first wins and prints `in_progress`; the second exits 1 naming who holds it and since when |
| `verbs/update.mts` | `cn update cn-2 --revision 0 --priority 1` twice | the second is refused with every change since revision 0 and the line to retry with |
| `verbs/journal.mts` | `cn journal cn-2 --kind finding "…"`, then `cn show cn-2` | the entry lands whatever the revision is, and shows newest first |
| `verbs/close.mts` | `cn close cn-2 --revision N --run 'vp run verify' --follow-up "…" --kind verify` | the stored record is the real exit code and output tail, and the follow-up exists beside the closed parent |
| `verbs/drop.mts` | `cn drop x-3 --revision 0`, then the same with `--reason "…"` | dropping without a reason exits 2, and with one it records the reason |
| `verbs/dep.mts` | `cn dep add cn-2 --blocked-by cn-1`, then `cn show cn-2`, then `cn dep rm cn-2 --blocked-by cn-1` | one row, read as `blocked by` from cn-2 and as `blocks` from cn-1, and removed by exactly that name |
| `verbs/wait.mts` | `cn create --project cn --epic ep-0 --title "scratch: blocker round trip"` → cn-N, then `cn wait cn-N --kind decision --owner balder --title "scratch" --resolves "the round trip is done"`, then `cn ready`, then `cn list` | the issue leaves ready the moment the blocker is raised and stays in list |
| `verbs/waiting.mts` | `cn waiting`, then `cn waiting --json` | one line per unresolved blocker in reference form with what it holds; with none it prints nothing and exits 0 |
| `verbs/ack.mts`, `verbs/resolve.mts` | `cn ack bl-N` (refused: this shell is an agent), then `env -u CLAUDECODE cn ack bl-N`, then `env -u CLAUDECODE cn resolve bl-N --note "done"`, then `cn ready`, then `cn drop cn-N --revision 0 --reason "scratch"` | an agent is refused by name; a person moves it raised → waiting → resolved; the issue is back in ready with no recompute; the scratch is dropped |
| `verbs/reconcile.mts` | `cn epic new "scratch: reconcile"` → ep-N, two `cn create --project cn --epic ep-N` titled "scratch: the same title" and "scratch: the same title.", then `cn reconcile ep-N` twice, then `env -u CLAUDECODE cn resolve bl-N --note scratch`, then `cn epic close ep-N --revision 0 --drop --reason scratch` | one decision blocker raised by `cairn/reconcile` holding both, a second run does nothing, and the scratch epic and its issues are dropped with the reason |

A local deployment with no account, once, in another terminal:
`vp run @cairn/backend#dev:local`. It writes `backend/.env.local`, which is
gitignored, and after that `vp run @cairn/backend#verify` and `#dev` target it.
`#verify` is `convex dev --once` and refuses while that watcher holds port 3210, so
stop the watcher first, or take the watcher's own `Convex functions ready!` line after
a save as the push having happened: it pushes every change as it lands.

That watcher pushes to the local deployment alone. A backend change reaches the
worklist deployment only through `vp run @cairn/backend#push:cloud`, which reads
`backend/.env.cloud.local`; `#dev:cloud` is the same watcher against it. Both go
through `backend/scripts/cloud.mjs`, which puts `.env.local` back byte for byte
afterwards, because convex 1.46 saves the deployment it just talked to into
`.env.local` whatever `--env-file` says and would leave `#verify`, `#dev` and the
MCP server pointed at the cloud without saying so.

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
| `backend/scripts/` | | `cloud.mjs`, the wrapper `#dev:cloud` and `#push:cloud` run through. |
| `packages/cli/` | `@cairn/cli` | `cn`. `src/verbs/` is one file per verb, `src/lib/` the shell they run in. |
| `plugins/cairn/` | | the skill, the SessionStart hook, the slash commands. |
| `docs/` | | `design.md`. |
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

- **A verb is one Convex function** plus formatting, and where a verb takes an action
  word (`epic new`, `dep rm`) each action is one function. The CLI never decides. If a
  verb needs logic, the logic goes in `backend/convex/` and gets a test there.
- **The reference form.** Every output line, journal entry, commit and reply that
  names an issue or epic uses `app-14 "fix connection retry"`. It is spelled in
  one place, `ref()` in `packages/cli/src/lib/ref.mts`.
- **`.mts`, an extension on every import, erasable syntax only** in
  `packages/cli`. Node strips the types; nothing is built. The type check resolves
  like a bundler and does not require the extension, so `src/smoke.test.mts`, which
  runs the real `cn` under Node for every verb, is what fails on a missing one.
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

Every task is a cairn issue in cairn, on the cloud deployment `cairn` that
`~/.config/cairn/config.json` defaults to. What to do next is `cn ready` with
nothing set in the environment: claim it, journal as you go, and close it with
`--run 'vp run verify'`. `CAIRN_URL=http://127.0.0.1:3210` is the anonymous local
deployment, which the rows above run against and which carries a copy of the
worklist.

The eleven slices mapped on 2026-09-17 went in that day as `cn-1` to `cn-11`
under `ep-1` to `ep-5`, and the file they came from is gone.
