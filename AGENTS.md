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
 Test Files  15 passed (15)      ← backend
 Test Files  42 passed (42)      ← cli
 Test Files  19 passed (19)      ← web
```

`vp check --fix` repairs formatting. Lint and type errors are yours to fix. The
gate is fast enough that scoping the check buys nothing (one file 1.1s, the
whole tree 0.9s); scope the tests only once the suite is slow, with
`vp run @cairn/cli#test` or `vp run @cairn/backend#test`.

The per-verb rows below are one script. `vp run verify:e2e` runs them in table
order against a throwaway deployment it starts empty, so the ids they name are
the ones an empty deployment mints — `ep-1`, `cn-1`, `bl-1` — and it stops that
deployment and deletes its state after itself. `packages/cli/src/contract.test.mts`
holds the script's rows to the table's, name for name and in order, so a row
renamed in one place and not the other fails `vp run verify`. Its last line is:

```
e2e: 25 rows passed against an empty throwaway deployment
```

To run one row by hand, `vp run @cairn/backend#dev:throwaway` in another terminal
holds a deployment like it open and prints the `CAIRN_URL=…` line to export.
Neither the rows nor the throwaway ever touch the worklist or the local copy on
port 3210.

Tests prove the unit. Depending on what changed, one more command proves the
change works where it runs:

| Changed | Also run | What it proves |
|---|---|---|
| `backend/convex/**` | `vp run @cairn/backend#verify` | the functions push to the configured deployment and pass Convex's own `tsc` |
| `backend/convex/lib/guard.ts` | `CAIRN_SECRET=wrong cn ready`, then `cn ready` | the cloud deployment refuses a wrong secret in one line naming the fix, and answers with the right one |
| `packages/cli/**` | `vp run verify:e2e` | every verb runs end to end against a real deployment, not only in a unit test |
| a verb's header | `cn <verb> --help` | the header reads as the contract it is |
| `packages/cli/src/lib/parts.mts`, `lines.mts`, `views.mts`, `time.mts`, `ref.mts`, `testing.mts`, or the `exports` map in `packages/cli/package.json` | `vp run @cairn/web#test`, then `vp run @cairn/web#build` | the page's rows are still cn's lines: `apps/web/src/rows.test.tsx` and `sheet.test.tsx` render each row and each page's table and hold the text to what cn prints from the same view; and every `@cairn/cli/*` import the page makes still resolves through the exports map, which is the only way in — nothing under `apps/web` names a path under `packages/cli/src` |
| `apps/web/**` | `vp run @cairn/web#build`, then with `vp run @cairn/backend#dev:throwaway` held open in another terminal: `VITE_CAIRN_URL=<the throwaway's> vp run dev:web`, `CAIRN_URL=<the same> cn epic new "scratch"`, and the page in a browser | every import the page makes resolves for a browser, the generated `api` and the CLI's `ref.mts` among them, which neither `vp check` nor the tests can prove; and the page prints the new epic in the reference form without a reload, the write itself landing at the top of the Activity feed. Then click the epic, one of its issues, and Copy reference: the path changes with no page load, and the clipboard holds the reference form A headless browser needs a real wait before it reads the DOM: `--dump-dom` returns at the load event, before the subscription has answered |
| `plugins/cairn/**` | `bash plugins/cairn/hooks/session-start.sh` four ways — with `CAIRN_URL` set, with it unset on a machine that has a config, with `XDG_CONFIG_HOME` pointed at an empty directory, and with it pointed at a directory whose `cairn/config.json` names `dead` at `http://127.0.0.1:9` — plus `claude plugin validate plugins/cairn --strict` | the brief from the environment, the brief from the file, with nothing configured the two lines pointing at `/cairn:init`, and with a deployment that does not answer the one line `cairn: dead did not answer; cn doctor says why` in under 5 s; exit 0 every way, and a manifest that validates |
| `plugins/cairn/evals/**`, or the skill's rule on how work is named | `vp run verify:evals` | every case under `plugins/cairn/evals/`, run by `claude plugin eval` as a fresh session with only the cairn plugin, against a throwaway it starts, seeds and stops, the child reading a stand-in `cn` in the case's `bin/` that answers from what the real `cn` printed against that throwaway moments before, since the eval sandbox can read only the case's own directory and reach no port: `first-mention` seeds four issues in project `app`, one held by another session and one needing ios, starts the session with the brief in context and asks "What's next?"; it passes only when the skill fired, the session read the issues through `cn show`, and the final reply names every ready issue in the reference form, each with a sentence of what it is and where it stands, so the bare list fails. Exit 0 with each case at 1.0, and `evals: 1 case passed against an empty throwaway deployment` last. Each run is a `claude -p` child on this account's credential and takes a minute or two, so it is run by hand, never by CI; results land under `plugins/cairn/evals/results/`, which is gitignored; `node scripts/verify-evals.mjs --keep-temp` keeps each run's sandbox and trace when a grader's reason is not in the report |
| `.claude/settings.json` | `claude plugin details cairn@cairn` from the repo root | the inventory names the skill, the four commands and the SessionStart and Stop hooks; it needs the folder's trust dialog accepted once in an interactive `claude`, before which project marketplaces are ignored without a message, and `claude plugin list` never shows a project-enabled plugin |
| `verbs/doctor.mts` | `cn doctor`, with nothing set in the environment | the last two lines are the deployment answering and `✓ secret accepted by cairn`, not only the config resolving; between the deployment line and the ping, `✓ actor balder/claude (agent), session …` and `✓ can web android` name what a claim will carry and what `cn ready` marks against |
| `verbs/project.mts` | `cn project new cn --name "cairn: backend, cli, plugin"`, then `cn project list` | a slug becomes an id prefix, and the list reads it back |
| `verbs/epic.mts` | `cn epic new "Create to close"`, then `cn epic list` | the first epic mints `ep-1`, and the list prints its health block |
| `verbs/create.mts` | `cn create --project cn --epic ep-1 --title "scratch: nothing" --design @missing.md`, then `cn create --project cn --epic ep-1 --title "scratch: first" --description "scratch: the first line\n\nand a second paragraph" --design @notes.md` → cn-1, the same titled "scratch: second" with no description → cn-2, then the same with no `--epic` | a missing file is a usage error naming it and mints nothing; an issue mints in order, its design read from the file; with no epic it exits 1 and lists the open ones |
| `verbs/list.mts` | `cn list --epic ep-1 --json`, then `cn list --silent 0d`, `cn list --silent 1d`, `cn list --blocked` and `cn list --silent 3x` | priority then age — exactly cn-1 then cn-2 — and `--json` carries id and title; under a zero duration every live issue, each line ending `· silent just now` and `--json` carrying `silentSince`; nothing under a day, nothing blocked with no edge, both exiting 0; and a duration without a unit exiting 2 |
| `verbs/ready.mts` | `cn create --project cn --epic ep-1 --title "scratch: needs ios" --requires ios` → cn-3, then `cn ready`, then `cn ready --can web` | open unblocked work in priority order, and the cn-3 row marked `· needs ios` rather than hidden |
| `verbs/brief.mts` | `cn brief`, then `cn brief --can decision`, then `cn brief --unjournaled` | under 20 lines, counts and heads; the follow-ups line grows by what `--can` covers, and `cn ready` shows all of them marked; with nothing held quiet `--unjournaled` prints nothing and exits 0, and with a claim of this session's an hour past its newest entry it prints the one line, `you hold cn-… "…", last journal 1h ago` |
| `verbs/show.mts` | `cn show cn-1`, then `cn show ep-1`, then `cn show cn-1 --history` | the brief opens its status line with the state, `open · P2 · …`, prints the first line of the description marked as cut, and the neighbourhood; an epic's open issues; and every event in order |
| `verbs/claim.mts`, `verbs/release.mts` | `cn claim cn-2`, then `CAIRN_ACTOR=other/agent cn claim cn-2`, then `cn release cn-2` and `cn claim cn-2` again | the first wins and prints `in_progress`; the second exits 1 naming who holds it and since when; a release hands it back |
| `verbs/update.mts` | `cn update cn-2 --revision N --priority 1` twice, against the revision `cn show` printed | the second is refused with every change since that revision and the line to retry with |
| `verbs/journal.mts` | `cn journal cn-2 --kind finding "scratch: a finding"`, then `cn show cn-2`, then `printf 'line1\nline2' \| cn journal cn-2 --kind finding @-`, then `cn journal cn-2 --kind finding @-` with nothing on stdin | the entry lands whatever the revision is, and shows newest first; both lines land from stdin; and an empty stdin is refused as a missing body |
| `verbs/search.mts` | `cn search first`, then `cn search paragraph`, then `cn search FINDING`, then `cn search scratch --json`, then `cn search scratch --status open --json`, then `cn search nothing-like-this`, then `cn search` | one line each: the cn-1 row marked `· in title`, the same row marked `· in description`, and the cn-2 row marked `· in journal` from its entry alone, case aside; `--json` carrying cn-2, cn-1, cn-3 in priority then age, each with `matched`; `--status` leaving the claimed cn-2 out; nothing matching printing nothing and exiting 0; and no text exiting 2 |
| `verbs/dep.mts` | `cn dep add cn-2 --blocked-by cn-1`, then `cn show cn-2`, `cn show cn-1`, `cn ready` and `cn list --blocked`, then `cn dep rm cn-2 --blocked-by cn-1` | one row, read as `blocked by` from cn-2 and as `blocks` from cn-1, holding cn-2 out of ready, listed by `cn list --blocked` as `· blocked by cn-1 "scratch: first"` and gone from it after the rm, and removed by exactly that name |
| `verbs/wait.mts` | `cn create --project cn --epic ep-0 --title "scratch: blocker round trip"` → cn-4, then `cn wait cn-4 --kind decision --owner balder --title "scratch" --resolves "the round trip is done"` → bl-1, then `cn ready`, then `cn list` | the issue leaves ready the moment the blocker is raised and stays in list |
| `verbs/waiting.mts` | `cn waiting`, then `cn waiting --json`, then `cn show bl-1` | one line per unresolved blocker in reference form, the issues it holds under it, and the blocker read on its own |
| `verbs/ack.mts`, `verbs/resolve.mts` | `cn ack bl-1` (refused: this shell is an agent), then `env -u CLAUDECODE cn ack bl-1`, then `env -u CLAUDECODE cn resolve bl-1 --note "done"`, then `cn ready`, then `cn waiting` | an agent is refused by name; a person moves it raised → waiting → resolved; the issue is back in ready with no recompute, and with nothing waiting `cn waiting` prints nothing and exits 0 |
| `verbs/drop.mts` | `cn drop cn-4 --revision N`, then the same with `--reason "scratch"`, then `cn show cn-4` | dropping without a reason exits 2, and with one it records the reason; the brief reads `dropped just now` and prints the reason on its own line |
| `verbs/close.mts` | `cn dep add cn-3 --blocked-by cn-1` and `cn dep add cn-3 --blocked-by cn-2`, then `cn close cn-1 --revision N --run 'exit 3'`, then `cn close cn-2 --revision N --run 'echo proof' --follow-up "scratch: follow-up" --kind verify`, then `cn close cn-1 --revision N --run 'echo proof'`, then `cn show cn-3` and `cn ready` | a command that failed cannot close an issue; the stored record is the real exit code and output tail, which `cn show` prints as `proof  echo proof (exit 0) by … just now`, and the follow-up exists beside the closed parent; closing one of the two issues holding cn-3 prints no `ready` line, and closing the other prints `  ready      cn-3 "scratch: needs ios" … · needs ios` under it; both edges then read `done` under `blocked by`, cn-3's state stays `open`, and `cn ready` lists it again |
| `verbs/log.mts` | `cn log`, then `cn log --limit 3`, then `cn log --limit 200 --json`, then `cn log --limit 0` | one line per event across the deployment, newest first, each led by the reference form or `—`, and no raw JSON on any of them: a journal entry reading `finding: <its first line>`, an edge once, on the end that leads its sentence, `cn-2 "…"  edge.add  …  blocked by cn-1`, the raise on cn-4 reading `bl-1 "scratch" decision · owner balder`, the resolve that freed it `bl-1 "scratch": done`, the blocker's own resolve `resolution — → done, status waiting → resolved`, and the project's create `cn "cairn: backend, cli, plugin"`; exactly the three newest; every issue, epic or blocker an event names carrying id and title, with cn-2's close reading `echo proof (exit 0)`; and a limit out of range exiting 2 |
| `verbs/epic.mts` (close) | `cn epic close ep-1 --revision N` with cn-3 still open | closing over open work is refused, naming it |
| `verbs/create.mts` (near) | `cn epic new "scratch: review"` → ep-2, then `cn create --project cn --epic ep-2 --title "scratch: the same title"` → cn-6, then the same titled "scratch: the same title." → cn-7 | an issue mints in an epic that holds nothing like it with no `near` line; a near-identical title is still created, and its answer carries `  near       cn-6 "scratch: the same title"` under the issue line |
| `verbs/review.mts` | `cn review ep-2`, then `cn review ep-2 --json`, then `cn review ep-2` twice more around `cn log --limit 200 --json`, then `cn review cn-1`, then `cn dep add cn-7 --duplicates cn-6` and `cn review ep-2` | the head `ep-2 "scratch: review"  0 done · 2 open · 0 follow-ups` and exactly one line, `  near        cn-6 "scratch: the same title" and cn-7 "scratch: the same title."`, with `--json` carrying that pair and `canClose` false; the log the same length after the runs, since a review writes nothing; an issue id exiting 2; and with the duplicates edge given, the head and `  nothing to look at` |
| `verbs/close.mts` (offer) | `cn close cn-6 --revision N --run 'echo proof'`, then `cn close cn-7 --revision N --unverified "scratch: no device here"`, then `cn close cn-8 --revision N --run 'echo proof'`, then `cn review ep-2`, then the `cn epic close ep-2 --revision 0` it printed, then `cn review ep-2` | no `epic` line while a twin is open; the unverified close spawns `  follow-up  cn-8 "verify: scratch: the same title."` beside it and still offers nothing; closing that follow-up prints `  epic       ep-2 "scratch: review" can close · cn epic close ep-2 --revision 0`; the review reads `2 done · 0 open · 0 follow-ups` and `  can close   cn epic close ep-2 --revision 0`; the printed line closes the epic, after which the review reads `  nothing to look at` and `canClose` is false |
| `plugins/cairn/hooks/stop.sh` | `printf '{"session_id":"<this session>"}' \| bash plugins/cairn/hooks/stop.sh` with a claim held by that session; then the same with `"stop_hook_active":true`; then with empty stdin | with the claim an hour past its newest entry, one JSON line whose `hookSpecificOutput.additionalContext` is the `cn brief --unjournaled` line, and with the claim fresh nothing at all; silent under `stop_hook_active`, silent with no session, exit 0 every way. The e2e row proves the wrapping with a stand-in `cn`, since an hour cannot pass inside it; the threshold crossing is `backend/convex/tests/brief.test.ts` |
| `verbs/init.mts` | with `XDG_CONFIG_HOME` pointed at an empty directory and no `CAIRN_URL` throughout: `cn doctor`, then `bash plugins/cairn/hooks/session-start.sh`, then `cn init --name e2e --url <the throwaway's> --secret-cmd "echo s3cret" --can web android`, then `cn doctor`, then that same `cn init` again, then `cn init --name other --url <the same>`, then `cn init --name dead --url http://127.0.0.1:9`, then the hook with `XDG_CONFIG_HOME` pointed at a directory whose `cairn/config.json` names `dead` at that URL, then the hook again | a cold machine is told to run `cn init` and the hook points at `/cairn:init`; the config lands mode 600 with the secret never printed; a name already there is refused and the bytes do not move; a second deployment leaves the default and `can` alone and carries no `secret` key; a deployment that does not answer writes nothing; a config naming one starts a session with `cairn: dead did not answer; cn doctor says why` and nothing else, exit 0, in under 5 s; and the hook that asked for setup now prints the brief |

A local deployment with no account, once, in another terminal:
`vp run @cairn/backend#dev`. It writes `backend/.env.local`, which is
gitignored, and after that `vp run @cairn/backend#verify` targets it too.
`#verify` runs `convex dev --once` through `scripts/local.mjs` and refuses while that
watcher holds port 3210, so
stop the watcher first, or take the watcher's own `Convex functions ready!` line after
a save as the push having happened: it pushes every change as it lands.

That watcher pushes to the local deployment alone. A backend change reaches the
worklist deployment only through `vp run @cairn/backend#push:cloud`, which reads
`backend/.env.cloud.local`; `#dev:cloud` is the same watcher against it, and both
put `.env.local` back after themselves. `#dev`, `#verify` and `#codegen` pin
the anonymous deployment in the environment and rewrite
`backend/.env.local` when they find it naming anything else, saying so in one line.
The one path that still flips it is a bare `npx convex` in `backend/`, and the next
`vp run @cairn/backend#…` command corrects it.

Three things enforce the gate, so a session cannot skip it by forgetting:

- **Pre-commit** runs `vp check --fix` on staged files. `vp config` arms it once
  per clone; the hook lives in `.vite-hooks/`, the rule in `vite.config.ts`.
- **A Claude Stop hook** refuses to end a turn while a changed file fails
  `vp check`, and hands the output back. Once; it does not loop.
- **CI** runs `vp check`, every test, the web bundle and `vp run verify:e2e` on push
  and pull request.

## Layout

| Path | Package | Holds |
|---|---|---|
| `backend/convex/` | `@cairn/backend` | schema, functions, tests. `_generated/` is committed and never hand-edited. |
| `backend/scripts/` | | `run-convex.mjs` starts `convex` for the other three, from the package's own binary, with the spawn, the signals and the exit status in one place. `local.mjs` and `cloud.mjs` are the wrappers every `convex` command runs through: one pins the anonymous deployment, the other restores it. `throwaway.mjs` starts an empty one on its own ports and state, for the e2e rows. |
| `packages/cli/` | `@cairn/cli` | `cn`. `src/verbs/` is one file per verb, `src/lib/` the shell they run in. |
| `plugins/cairn/` | | the skill, the SessionStart and Stop hooks, the slash commands, and the evals that hold the skill's rules in a real session. |
| `scripts/` | | `verify-e2e.mjs`, the per-verb rows of the table above as one script; `verify-evals.mjs`, the eval row: a throwaway, a seeded worklist, a stand-in `cn` recorded from the real one, and `claude plugin eval`. |
| `docs/` | | `design.md`. |
| `apps/web/` | `@cairn/web` | the web window: Vite, React and `convex/react`, subscribing to the functions `cn` calls. It imports the generated `api` from `@cairn/backend`, and the reference form and the parts of every line from `@cairn/cli`, through its exports map (`@cairn/cli/parts`, `views`, `ref`, never a path under `src/`): a row on the page is one of cn's lines, typeset, never reworded (`docs/design.md` §8, "The web window"). shadcn components live in `src/components/ui/`, the tokens and the three surfaces in `src/index.css`. Tests render to a string in node; there is no DOM in the suite. |

## Toolchain: vp, only

| Do | Not |
|---|---|
| `vp install` | `pnpm install`, `npm install` |
| `vp run verify`, or `vp check --fix` for formatting alone | prettier, eslint, a bare `tsc`, `npx vitest` |
| `vp run @cairn/backend#dev` for the Convex dev loop | |
| `vp run dev:web` for the page, with `VITE_CAIRN_URL` naming the deployment, both it and `CAIRN_SECRET` in the gitignored `apps/web/.env.local` | a secret under a `VITE_` name: vite inlines those into every bundle. `CAIRN_SECRET` reaches the dev server alone, a build defines it empty, and a built page asks for a paste that stays in that browser |
| `vp run codegen` after a schema or function change | editing `_generated/` |
| `vp dlx shadcn@latest add <component>` from `apps/web`, then point the new file's `cn` import at `@/lib/utils` | the npm package `cn` the generated import names: it installs a binary called `cn`, and here `cn` is the CLI |
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
  verb. Its flags are its exported `spec`, and `contract.test.mts` holds the
  header's synopsis, the skill, the slash commands, design §10 and the CLI's README
  to it. `--help` and `-h` are answered in `main.mts`, so no verb handles them; a
  verb takes flags only unless its synopsis names a positional, and refuses a stray
  one through `onlyFlags`.
- **Mutable writes carry `revision`. Journal entries are inserts.**
- **`epicId` is required. Closing takes a verification record.**
- **A fact is read where it is read.** `cn show` says what an issue's neighbourhood means
  now, a `blocks` edge into a closed issue reading `done` rather than being deleted by a
  run (design §7); the page prints the same words from the same `…Parts` in `parts.mts`.

## Commits and pull requests

Conventional Commits, and the pull request title is the squash-merge subject.
Scopes here: `backend`, `cli`, `plugin`, `docs`, `tooling`.

## Dogfood

Every task is a cairn issue in cairn, on the cloud deployment `cairn` that
`~/.config/cairn/config.json` defaults to. What to do next is `cn ready` with
nothing set in the environment: claim it, journal as you go, and close it with
`--run 'vp run verify'`. `CAIRN_URL=http://127.0.0.1:3210` is the anonymous local
dev deployment that `#dev` and `#verify` push to and that carries a copy of the
worklist; the verify rows run against a throwaway of their own and never against
it.

The eleven slices mapped on 2026-09-17 went in that day as `cn-1` to `cn-11`
under `ep-1` to `ep-5`, and the file they came from is gone.
