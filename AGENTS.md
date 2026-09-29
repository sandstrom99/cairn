# Working in cairn

Read `docs/design.md` first. It is the design, and every decision in it is a
decision. A change that contradicts it changes the document in the same pull
request, or does not happen.

## What this is

An agent worklist on Convex. One deployment per company, a `cn` CLI over typed
Convex calls, and a Claude Code plugin that teaches agents to use it. Tasks
only: not a wiki, not a knowledge base, not an orchestrator.

## Where work happens

Never in the install. `cn` on PATH and the plugin every repository's sessions load both
run from a clone kept at `main`, `~/.local/share/cairn` by the README's "1. Install `cn`",
so a branch checked out there changes every company's sessions at once. Work happens in
a development clone, anywhere other than the install, and in the worktrees under its
`.claude/worktrees/`, where checking anything out reaches nothing else.

- **`cn` on PATH runs main.** Where a row below runs `cn` by hand, it means this
  checkout's: `export PATH="$PWD/packages/cli/bin:$PATH"` first. The hooks call `cn` by
  name, so their rows need it too. `vp run verify:e2e` runs this checkout's `cn` itself.
- **A session here runs main's plugin**, not this checkout's, since the registered
  install wins over the `"."` in `.claude/settings.json`.
- **A new worktree comes up ready.** Its first session's SessionStart hook,
  `.claude/hooks/worktree-ready.sh`, runs `vp install` when `node_modules` is missing
  and `vp config` when the pre-commit hook does not resolve: the desktop app's worktrees
  keep a relative hooks path that git cannot find from them, and git then skips the gate
  without a word. `.worktreeinclude` copies what developing needs and nothing a company
  runs on: `apps/web/.env.local`, never an `.env.cloud` file. A worktree Claude Code
  creates starts from `origin/main`, not from what is checked out.
- **After a merge**, bring the install up to it: `git -C ~/.local/share/cairn pull
  --ff-only`, then `vp install` from inside it. A `#push:cloud` after a merge runs from
  there too: the install's `backend/` holds each deployment's `.env.cloud.<name>.local`,
  so what it pushes is main. A development clone holds none, and pushing a branch to a
  company's deployment takes copying that one company's file into its `backend/` first.

## Verify a change

This section is the verification suite, at its start. It grows with the
project: every new verb, table or surface adds its row to the table below and,
where the unit tests cannot prove it, a command that runs it for real. Nothing
here is optional, and nothing gets removed because it became inconvenient.

`vp run verify` and `vp run verify:e2e` need no deployment of anyone's, since the e2e
rows run against a throwaway they start and stop. A row that names the cloud deployment
`cairn`, or needs a cloud deployment at all (`#push:cloud`, `#secret` against the cloud,
`#new:cloud`, `cn doctor` with nothing set, the guard row, the `.claude/settings.json`
row, the init.md row's cairn checkout), runs against a deployment of your own, stood up
as the README's "Install by hand" says, with `cairn` read as its name; or the pull
request names it as not run, and why.

One command, about a second, before you say anything works:

```bash
vp run verify        # vp check (format, lint, types), then every test
```

Green is exactly this, and nothing else counts:

```
pass: All N files are correctly formatted
pass: Found no warnings, lint errors, or type errors in N files
 Test Files  N passed (N)      ← backend
 Test Files  N passed (N)      ← cli
 Test Files  N passed (N)      ← web
```

Each `N` is whatever the tree holds that day, so a new test file changes none of this.
What makes it green is the shape: both `pass:` lines, and three `Test Files` lines in
that order, each with the same number twice and no `failed` in it.

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
e2e: 36 rows passed against an empty throwaway deployment
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
| `backend/scripts/cloud.mjs` | a bare `vp run @cairn/backend#push:cloud`, which pushes every deployment with a `backend/.env.cloud.<name>.local`, naming each as it goes, and so is asked for first; then the site root `cn doctor`'s `✓ page …` line names and `/cn-1` in a browser, the secret pasted once, and a reload | one command pushes the functions and then the page they serve, and says `Upload complete!` last; each deployment gets its functions, the record of the commit they came from, and then its page, in name order; a path the page routes itself serves the page when opened cold; the pasted secret reads the worklist and the reload does not ask again; and `backend/.env.local` still names the local deployment afterwards |
| `backend/scripts/secret.mjs` | `sha256sum backend/.env.local`, then `vp run @cairn/backend#secret -- new cairn`, then `vp run @cairn/backend#secret -- bogus`, then the sum again | against the cloud deployment, which has a secret, `new` exits 2 naming it, prints nothing on stdout and changes nothing; an unknown action exits 2 with the usage line; and `.env.local` hashes the same afterwards. `rotate` against the cloud locks every machine out until each runs `cn init --refresh`, so it is run when a rotation is meant, never as a check. Then, with the real file moved out of `backend/` and two fakes in its place, `backend/.env.cloud.fake-a.local` and `fake-b`, each naming `dev:fake-…` and `https://fake-….invalid`: `#secret -- rotate` exits 2 naming both, `#secret -- rotate nope` exits 2 naming both, and `#dev:cloud` exits 2 naming both, each before anything runs; a bare `#push:cloud` against the two fakes stops at the first with `stopped at fake-a; not pushed: fake-b`; with an empty `backend/.env.cloud.local` beside them, `#secret -- rotate fake-a` and `#push:cloud` exit 1 with the old-name line; and `.env.local` hashes the same throughout |
| `backend/scripts/new-cloud.mjs` | logged in to Convex: `sha256sum backend/.env.local`, then `vp run @cairn/backend#new:cloud -- scratch --project cairn-scratch`, then `cat backend/.env.cloud.scratch.local`, then the sum again; afterwards the project is deleted from the Convex dashboard and the file removed | one Convex project, `cairn-scratch`, with a development deployment and no functions on it; the file names that deployment and its URL; the `next:` line names `#secret -- new scratch`; and `.env.local` hashes the same afterwards. It creates a real project on the account, so it is run when that is meant, never as a check |
| `plugins/cairn/**` | `bash plugins/cairn/hooks/session-start.sh` four ways — with `CAIRN_URL` set, with it unset on a machine that has a config, with `XDG_CONFIG_HOME` pointed at an empty directory, and with it pointed at a directory whose `cairn/config.json` names `dead` at `http://127.0.0.1:9` — plus `claude plugin validate plugins/cairn --strict` | the brief from the environment, the brief from the file, with nothing configured the two lines pointing at `/cairn:init`, and with a deployment that does not answer the one line `cairn: dead did not answer; cn doctor says why` in under 5 s; exit 0 every way, and a manifest that validates |
| `plugins/cairn/commands/init.md` | a scratch git repository whose `.claude/settings.local.json` holds exactly what part 3 writes, `{"enabledPlugins":{"cairn@cairn":true},"env":{"CAIRN_DEPLOYMENT":"e2e"}}`, and `XDG_CONFIG_HOME` pointed at a directory where `cn init --name e2e --url <the throwaway's> --can web` has run; from that repository, `claude -p "Reply with the word ok." --output-format stream-json --verbose --include-hook-events --max-turns 1`; then the same with `enabledPlugins` taken out of the file; then the same from the cairn checkout with `XDG_CONFIG_HOME` unset | a repository wired the way `/cairn:init` wires it opens on its own deployment: among the `system` events with `subtype` `hook_response` and `hook_event` `SessionStart`, one has a `stdout` of e2e's brief, opening `cairn · e2e`; without `enabledPlugins` no hook prints a brief, so the plugin loads from that line and not from anything else on the machine; and the cairn checkout opens on `cairn · cairn`, the cloud worklist's brief. The marketplace is registered at user scope once per machine, and the check needs no `env -u CLAUDECODE` from inside a session |
| `plugins/cairn/evals/**`, or the skill's rule on how work is named | `vp run verify:evals` | every case under `plugins/cairn/evals/`, run by `claude plugin eval` as a fresh session with only the cairn plugin, against a throwaway it starts, seeds and stops, the child reading a stand-in `cn` in the case's `bin/` that answers from what the real `cn` printed against that throwaway moments before, since the eval sandbox can read only the case's own directory and reach no port: `first-mention` seeds four issues in project `app`, one held by another session and one needing ios, starts the session with the brief in context and asks "What's next?"; it passes only when the skill fired, the session read the issues through `cn show`, and the final reply names every ready issue in the reference form, each with a sentence of what it is and where it stands, so the bare list fails. Exit 0 with each case at 1.0, and `evals: 1 case passed against an empty throwaway deployment` last. Each run is a `claude -p` child on this account's credential and takes a minute or two, so it is run by hand, never by CI; results land under `plugins/cairn/evals/results/`, which is gitignored; `node scripts/verify-evals.mjs --keep-temp` keeps each run's sandbox and trace when a grader's reason is not in the report |
| `.claude/settings.json` | `claude plugin details cairn@cairn` from the repo root | the inventory names the skill, the four commands and the SessionStart and Stop hooks; it needs the folder's trust dialog accepted once in an interactive `claude`, before which project marketplaces are ignored without a message, and `claude plugin list` never shows a project-enabled plugin |
| `.claude/hooks/worktree-ready.sh`, `.worktreeinclude` | in a scratch clone of this checkout with the change committed, `refs/remotes/origin/main` moved to it, `core.hooksPath` set back to `.vite-hooks/_` and `apps/web/.env.local` holding one line: `git worktree add` one, as the desktop app does, and run the hook in it twice with `CLAUDE_PROJECT_DIR` naming it, then `git hook run pre-commit` there; then `claude -w probe -p "Reply with the word ok." --output-format stream-json --verbose --include-hook-events --max-turns 1`, and `vp run verify` in that worktree | the first run prints `cairn: a new worktree, so this session installed node_modules and armed the pre-commit hook` in about two seconds, the second prints nothing, and git finds the pre-commit hook; under `claude -w` the hook's line says `installed node_modules` alone, since Claude Code rewrites a relative hooks path to the main checkout's absolute one itself, the worktree holds `apps/web/.env.local` and no `backend/.env.cloud.*`, and `vp run verify` is green there |
| `verbs/doctor.mts` | `cn doctor`, with nothing set in the environment | the last three lines are the deployment answering, `✓ secret accepted by cairn`, and the functions line: `✓ functions on cairn pushed from …, the same as this cn's` once cairn has been pushed by a `#push:cloud` that records the commit, and until then `✗ cairn runs functions older than this cn: vp run @cairn/backend#push:cloud -- cairn`; not only the config resolving; between the deployment line and the ping, `✓ page https://….convex.site`, the deployment's URL with `.site` for `.cloud` and the region kept, which answers the page, then `✓ actor balder/claude (agent), session …` and `✓ can web android` name what a claim will carry and what `cn ready` marks against |
| `verbs/project.mts` | `cn project new cn --name "cairn: backend, cli, plugin"`, then `cn project list` | a slug becomes an id prefix, and the list reads it back |
| `verbs/epic.mts` | `cn epic new "Create to close"`, then `cn epic list` | the first epic mints `ep-1`, and the list prints its health block |
| `verbs/create.mts` | `cn create --project cn --epic ep-1 --title "scratch: nothing" --design @missing.md`, then `cn create --project cn --epic ep-1 --title "scratch: first" --description "scratch: the first line\n\nand a second paragraph" --design @notes.md` → cn-1, then the same titled "scratch: ftp" with `--link ftp://example.com/x`, then titled "scratch: second" with no description and `--link https://example.com/created` → cn-2, then the same with no `--epic` | a missing file is a usage error naming it and mints nothing; an ftp link exits 1 naming it and mints nothing; an issue mints in order, its design read from the file and its link on it; with no epic it exits 1 and lists the open ones |
| `verbs/list.mts` | `cn list --epic ep-1 --json`, then `cn list --silent 0d`, `cn list --silent 1d`, `cn list --blocked` and `cn list --silent 3x` | priority then age — exactly cn-1 then cn-2 — and `--json` carries id and title; under a zero duration every live issue, each line ending `· silent just now` and `--json` carrying `silentSince`; nothing under a day, nothing blocked with no edge, both exiting 0; and a duration without a unit exiting 2 |
| `verbs/ready.mts` | `cn create --project cn --epic ep-1 --title "scratch: needs ios" --requires ios` → cn-3, then `cn ready`, then `cn ready --can web` | open unblocked work in priority order, and the cn-3 row marked `· needs ios` rather than hidden |
| `verbs/brief.mts` | `cn brief`, then `cn brief --can decision`, then `cn brief --unjournaled` | under 20 lines, counts and heads; the follow-ups line grows by what `--can` covers, and `cn ready` shows all of them marked; with nothing held quiet `--unjournaled` prints nothing and exits 0, and with a claim of this session's an hour past its newest entry it prints the one line, `you hold cn-… "…", last journal 1h ago` |
| `verbs/show.mts` | `cn show cn-1`, then `cn show ep-1`, then `cn show cn-1 --history` | the brief opens its status line with the state, `open · P2 · …`, prints the first line of the description marked as cut, and the neighbourhood; an epic's open issues; and every event in order |
| `verbs/claim.mts`, `verbs/release.mts` | `cn claim cn-2`, then `CAIRN_ACTOR=other/agent cn claim cn-2`, then `cn release cn-2` and `cn claim cn-2` again | the first wins and prints `in_progress`; the second exits 1 naming who holds it and since when; a release hands it back |
| `verbs/update.mts` | `cn update cn-2 --revision N --priority 1` twice, against the revision `cn show` printed; then `cn update cn-2 --revision N --link '[doc](https://example.com/d)' --link https://example.com/b` and `cn show cn-2`, `--json` too; then `--link '[the doc](https://example.com/d)'`, then `--unlink https://example.com/b`, then `--link https://example.com/created` bare, then `--unlink https://example.com/missing` and `--link 'javascript:alert(1)'` | the second is refused with every change since that revision and the line to retry with; the links print as a `links` block of three lines, created, then doc, then b, each ending `by e2e/claude just now`, and `--json` carries them with `by.name`; the relabel and the unlink land; linking a URL the issue already carries exits 0 and leaves the revision where it was; a URL the issue does not carry and a `javascript:` link each exit 1 naming the value |
| `verbs/journal.mts` | `cn journal cn-2 --kind finding "scratch: a finding"`, then `cn show cn-2`, then `printf 'line1\nline2' \| cn journal cn-2 --kind finding @-`, then `cn journal cn-2 --kind finding @-` with nothing on stdin | the entry lands whatever the revision is, and shows newest first; both lines land from stdin; and an empty stdin is refused as a missing body |
| `verbs/search.mts` | `cn search first`, then `cn search paragraph`, then `cn search FINDING`, then `cn search example.com/d`, `--json` too, then `cn search scratch --json`, then `cn search scratch --status open --json`, then `cn search nothing-like-this`, then `cn search` | one line each: the cn-1 row marked `· in title`, the same row marked `· in description`, and the cn-2 row marked `· in journal` from its entry alone, case aside; the cn-2 row marked `· in links` from a link's URL, with `matched: "links"` in `--json`; `--json` carrying cn-2, cn-1, cn-3 in priority then age, each with `matched`; `--status` leaving the claimed cn-2 out; nothing matching printing nothing and exiting 0; and no text exiting 2 |
| `verbs/dep.mts` | `cn dep add cn-2 --blocked-by cn-1`, then `cn show cn-2`, `cn show cn-1`, `cn ready` and `cn list --blocked`, then `cn dep rm cn-2 --blocked-by cn-1` | one row, read as `blocked by` from cn-2 and as `blocks` from cn-1, holding cn-2 out of ready, listed by `cn list --blocked` as `· blocked by cn-1 "scratch: first"` and gone from it after the rm, and removed by exactly that name |
| `verbs/wait.mts` | `cn create --project cn --epic ep-0 --title "scratch: blocker round trip"` → cn-4, then `cn wait cn-4 --kind decision --owner balder --title "scratch" --resolves "the round trip is done"` → bl-1, then `cn ready`, then `cn list` | the issue leaves ready the moment the blocker is raised and stays in list |
| `verbs/waiting.mts` | `cn waiting`, then `cn waiting --json`, then `cn show bl-1` | one line per unresolved blocker in reference form, the issues it holds under it, and the blocker read on its own |
| `verbs/ack.mts`, `verbs/resolve.mts` | `cn ack bl-1` (refused: an agent without `--said`), then `env -u CLAUDECODE cn ack bl-1`, then `cn resolve bl-1 --note "done"` (refused the same way), then `cn resolve bl-1 --note "done" --said "the round trip is done, go ahead"`, then `cn show bl-1`, then `cn ready`, then `cn waiting` | an agent without the person's word is refused naming `--said`, and a person needs none; with the word the blocker is resolved and `cn show bl-1` prints `on their word   "the round trip is done, go ahead"` under `resolved`; the issue is back in ready with no recompute, and with nothing waiting `cn waiting` prints nothing and exits 0 |
| `verbs/drop.mts` | `cn drop cn-4 --revision N`, then the same with `--reason "scratch"`, then `cn show cn-4` | dropping without a reason exits 2, and with one it records the reason; the brief reads `dropped just now` and prints the reason on its own line |
| `verbs/close.mts` | `cn dep add cn-3 --blocked-by cn-1` and `cn dep add cn-3 --blocked-by cn-2`, then `cn close cn-1 --revision N --run 'exit 3'`, then `cn close cn-2 --revision N --run 'echo proof' --follow-up "scratch: follow-up" --kind verify`, then `cn close cn-1 --revision N --run 'echo proof'`, then `cn show cn-3` and `cn ready` | a command that failed cannot close an issue; the stored record is the real exit code and output tail, which `cn show` prints as `proof  echo proof (exit 0) by … just now`, and the follow-up exists beside the closed parent and is open, its `follow-ups` line with no word after it; closing one of the two issues holding cn-3 prints no `ready` line, and closing the other prints `  ready      cn-3 "scratch: needs ios" … · needs ios` under it; both edges then read `done` under `blocked by`, cn-3's state stays `open`, and `cn ready` lists it again |
| `verbs/log.mts` | `cn log`, then `cn log --limit 3`, then `cn log --limit 200 --json`, then `cn log --limit 0` | one line per event across the deployment, newest first, each led by the reference form or `—`, and no raw JSON on any of them: a journal entry reading `finding: <its first line>`, an edge once, on the end that leads its sentence, `cn-2 "…"  edge.add  …  blocked by cn-1`, the raise on cn-4 reading `bl-1 "scratch" decision · owner balder`, the resolve that freed it `bl-1 "scratch": done, on their word "the round trip is done, go ahead"`, the blocker's own resolve `resolution — → done, status waiting → resolved, on their word "the round trip is done, go ahead"`, cn-2's link edits `linked doc · https://example.com/d, linked https://example.com/b`, `relabelled doc → the doc · https://example.com/d` and `unlinked https://example.com/b`, and the project's create `cn "cairn: backend, cli, plugin"`; exactly the three newest; every issue, epic or blocker an event names carrying id and title, with cn-2's close reading `echo proof (exit 0)`; and a limit out of range exiting 2 |
| `verbs/epic.mts` (close) | `cn epic close ep-1 --revision N` with cn-3 still open | closing over open work is refused, naming it |
| `verbs/create.mts` (near) | `cn epic new "scratch: review"` → ep-2, then `cn create --project cn --epic ep-2 --title "scratch: the same title"` → cn-6, then the same titled "scratch: the same title." → cn-7 | an issue mints in an epic that holds nothing like it with no `near` line; a near-identical title is still created, and its answer carries `  near       cn-6 "scratch: the same title"` under the issue line |
| `verbs/review.mts` | `cn review ep-2`, then `cn review ep-2 --json`, then `cn review ep-2` twice more around `cn log --limit 200 --json`, then `cn review cn-1`, then `cn dep add cn-7 --duplicates cn-6` and `cn review ep-2` | the head `ep-2 "scratch: review"  0 done · 2 open · 0 follow-ups` and exactly one line, `  near        cn-6 "scratch: the same title" and cn-7 "scratch: the same title."`, with `--json` carrying that pair and `canClose` false; the log the same length after the runs, since a review writes nothing; an issue id exiting 2; and with the duplicates edge given, the head and `  nothing to look at` |
| `verbs/close.mts` (offer) | `cn close cn-6 --revision N --run 'echo proof'`, then `cn close cn-7 --revision N --unverified "scratch: no device here"`, then `cn dep add cn-8 --blocked-by cn-6` and `cn review ep-2`, then `cn close cn-8 --revision N --run 'echo proof'`, then `cn show cn-7` and `cn show cn-8`, then `cn review ep-2`, then the `cn epic close ep-2 --revision 0` it printed, then `cn review ep-2` | no `epic` line while a twin is open; the unverified close spawns `  follow-up  cn-8 "verify: scratch: the same title."` beside it and still offers nothing; with cn-6 done and cn-8 open the review lists exactly the `edge` line `cn-6 "scratch: the same title" done blocks cn-8 "verify: scratch: the same title."`; closing that follow-up prints `  epic       ep-2 "scratch: review" can close · cn epic close ep-2 --revision 0`; `cn show cn-7` reads its follow-up `done`, and `cn show cn-8` reads its parent and its blocker `done`; the edge now joins two finished issues and is no line, so the review reads `2 done · 0 open · 0 follow-ups` and `  can close   cn epic close ep-2 --revision 0` alone; the printed line closes the epic, after which the review reads `  nothing to look at` and `canClose` is false |
| `verbs/update.mts` (epic) | `cn epic new "scratch: plan" --link '[plan](https://example.com/plan)'` → ep-3, then `cn show ep-3`, `--json` too; then `cn update ep-3 --revision 0 --title "scratch: the plan" --description "scratch: why"` twice; then `cn update ep-3 --revision 1 --link https://example.com/b` and `cn log --limit 1`; then `cn update ep-3 --revision 2 --priority 1`, and `--title` against the closed ep-2 and against ep-0 | the brief opens `ep-3 "scratch: plan"  0 done · 0 open · 0 follow-ups · revision 0` with `links           plan · https://example.com/plan · by e2e/claude just now` under it, and `--json` carries the link with `by.name`; the first update prints `ep-3 "scratch: the plan" r1` and the second is refused with the `epic.update` since and the line to retry with; the log reads `ep-3 "scratch: the plan"  epic.update … linked https://example.com/b`; `--priority` exits 2 with `an epic has no --priority; cn update ep-3 takes --title, --description, --link and --unlink`; the closed epic and the inbox each exit 1, `ep-2 is closed; nothing about it changes now` and `ep-0 is the inbox; it does not change` |
| `verbs/update.mts` (blocker) | `cn create --project cn --epic ep-3 --title "scratch: a decision"`, then `cn wait` on it `--kind decision --owner balder --title "scratch: options" --resolves "scratch: one is picked" --link '[options](https://example.com/options)'` → bl-2, then `cn show bl-2`, `--json` too; then `cn update bl-2 --revision 0 --title "scratch: the options" --resolves "scratch: one is chosen"` twice; then `cn update bl-2 --revision 1 --unlink https://example.com/options --link https://example.com/choice` and `cn show bl-2 --json`; then `cn update bl-2 --revision 2 --description x`, the same with `--owner someone`, `cn wait` on the issue `--on bl-2 --link https://example.com/x`, and `--title` against the resolved bl-1 | the status line ends `· revision 0` and `links           options · https://example.com/options · by e2e/claude just now` follows what it holds; the first update prints the blocker's line ending ` r1`, and the second is refused with the `blocker.update` since and the line to retry with; the links are exactly the choice and `whatResolves` the new words; `--description` exits 2 with `a blocker has no --description; cn update bl-2 takes --title, --resolves, --link and --unlink`, `--owner` and `--link` beside `--on` each exit 2 naming the flag, and the resolved blocker exits 1 with `bl-1 was resolved by …` |
| `plugins/cairn/hooks/stop.sh` | `printf '{"session_id":"<this session>"}' \| bash plugins/cairn/hooks/stop.sh` with a claim held by that session; then the same with `"stop_hook_active":true`; then with empty stdin | with the claim an hour past its newest entry, one JSON line whose `hookSpecificOutput.additionalContext` is the `cn brief --unjournaled` line, and with the claim fresh nothing at all; silent under `stop_hook_active`, silent with no session, exit 0 every way. The e2e row proves the wrapping with a stand-in `cn`, since an hour cannot pass inside it; the threshold crossing is `backend/convex/tests/brief.test.ts` |
| `verbs/init.mts` | with `XDG_CONFIG_HOME` pointed at an empty directory and no `CAIRN_URL` throughout: `cn doctor`, then `bash plugins/cairn/hooks/session-start.sh`, then `cn init --name e2e --url <the throwaway's> --secret-cmd "echo s3cret" --can web android`, then `cn doctor`, then that same `cn init` again, then `cn init --name other --url <the same>`, then `cn init --name dead --url http://127.0.0.1:9`, then the hook with `XDG_CONFIG_HOME` pointed at a directory whose `cairn/config.json` names `dead` at that URL, then the hook again | a cold machine is told to run `cn init` and the hook points at `/cairn:init`; the config lands mode 600 with the command kept beside the secret as `secretCmd` and the secret never printed; a name already there is refused and the bytes do not move; a second deployment leaves the default and `can` alone and carries no `secret` or `secretCmd` key; a deployment that does not answer writes nothing; a config naming one starts a session with `cairn: dead did not answer; cn doctor says why` and nothing else, exit 0, in under 5 s; and the hook that asked for setup now prints the brief |
| `lib/config.mts` | with `XDG_CONFIG_HOME` pointed at a directory whose `cairn/config.json` has `dead` at `http://127.0.0.1:9` as the default and `e2e` at the throwaway beside it: `cn doctor` with nothing set, with `CAIRN_DEPLOYMENT=e2e`, with `CAIRN_DEPLOYMENT=nope`, and with `CAIRN_URL` set beside `nope`; the SessionStart hook the same three ways; `cn init --refresh` with nothing set and with `CAIRN_DEPLOYMENT=e2e`; then `cn doctor` and the hook with `CAIRN_DEPLOYMENT=nope` and no config at all | the default is read `(from default, …)` and `CAIRN_DEPLOYMENT` overrides it `(from CAIRN_DEPLOYMENT, secret from config)` and `✓ secret accepted by e2e`; a name the file lacks exits 1 with one line naming `dead, e2e` and `cn init --name nope`, and `CAIRN_URL` still wins over it; the hook prints `cairn: dead did not answer; cn doctor says why` with nothing set, e2e's brief under `CAIRN_DEPLOYMENT=e2e`, and that one line under `nope`, exit 0 every way and under 5 s; a bare `--refresh` goes to `dead` and writes nothing, and under `CAIRN_DEPLOYMENT=e2e` it refreshes e2e; with no config the line says there is none. That Claude Code hands settings `env` to a hook is Claude Code's, proved once by hand on 2026-09-29 in a scratch repo, `settings.local.json` winning over `settings.json` |
| `backend/scripts/clouds.mjs` | `pickClouds` over directories built in the run: one empty, one holding the old name `.env.cloud.local` alone and one holding it beside `.env.cloud.cairn.local`, one holding that file alone, one holding it beside `.env.cloud.northwind.local` with the decoys `.env.local` and `.env.cloud.Bad_Name.local`, the name `nope` against that one, and a `.env.cloud.empty.local` naming no deployment, named and not | an empty directory is `no cloud deployment in backend/: …`, exit 1; the old name is refused with the line to rename it, exit 1, even beside a new one; one file is that deployment with or without `one`; two are `cairn, northwind` in name order and no decoy, `one` is refused with `name the deployment: backend/ has cairn, northwind`, exit 2, and `northwind` picks it alone; `nope` is `no cloud deployment named nope: backend/ has cairn, northwind`, exit 2; and the file naming no deployment is `backend/.env.cloud.empty.local names no CONVEX_DEPLOYMENT`, exit 1, whether named or not |
| `backend/scripts/page.mjs`, `backend/convex/convex.config.ts` | `shipPage` against the throwaway, the step `#push:cloud` runs after the functions, then GETs from the throwaway's site URL: `/`, then `/cn-1`, `/ep-1` and `/bl-1`, then the script `index.html` loads, then `/assets/missing.js` | the page builds for the deployment and uploads into it through the component's own CLI; the site root answers `index.html`, and every path the page routes itself answers the same bytes; the script is served as JavaScript and names the deployment that serves it; and a file the build did not make is a 404, never the page standing in for it |
| `backend/scripts/pushed.mjs` | `vp run verify:e2e` | `recordPush` against the throwaway, the step `#push:cloud` runs after the functions, three times, each followed by `cn doctor`: an all-zero commit, then this checkout's HEAD with `-dirty` after it, then HEAD itself | the last line names the commit this checkout has not fetched and `git -C <this checkout> pull --ff-only`, exit 1; then `✓ functions on … pushed from <HEAD's 7> with uncommitted changes, so not compared`, exit 0; then `✓ functions on … pushed from <HEAD's 7>, the same as this cn's`, exit 0, which the rows after it read |
| `backend/scripts/secret.mjs` (new) | `changeSecret` against the throwaway, as `#secret` runs it against the cloud: `rotate` on the open deployment, then `cn ready` with no secret; `revoke` with `--op op://Vault/x`, and `new` with `--op Vault/x`; then `new --op "op://Vault/cairn e2e"` with a stand-in `op` on PATH that lists no items, then `cn ready` with no secret and with the one the stand-in stored; then `new` again | a rotate on an open deployment exits 2 naming `new` and leaves it open; revoke refuses `--op`, and an `--op` that is not `op://<vault>/<item>` is refused naming that shape, each exiting 2; `new` exits 0 with nothing on stdout, and the stand-in logs `item list --vault Vault --format json` then `item create --vault Vault` taking on stdin a `SECURE_NOTE` titled "cairn e2e" with a `url` field, the throwaway's, and a `CONCEALED` `secret` of 44 characters of base64, which is in no argv; no stderr line carries the secret, and one is the `cn init --name` line a machine sets up with; a call with no secret exits 1 naming `cn init --refresh`, and the stored secret answers; a second `new` exits 2 with nothing on stdout, and the secret still answers |
| `backend/scripts/secret.mjs` (rotate) | `rotate`, then `cn ready` with the secret before and the one printed; `rotate --op "op://Vault/cairn e2e"` with the stand-in listing that item, then `cn ready` with each; then the same with the stand-in exiting 1 with `[ERROR] account is not signed in` | stdout carries exactly one secret, not the one before, and stderr never carries it; the secret before is refused and the printed one answers; an item that exists is read with `item get` and written back through `item edit "cairn e2e" --vault Vault` on stdin with every other field as it was and the new secret in no argv, never created again, and its secret answers while the one before is refused; with `op` failing it exits 1, saying `nothing changed` and passing op's own line on, and the secret still answers |
| `backend/scripts/secret.mjs` (revoke) | `revoke`, then `cn ready` with the last secret and with none, then `convex env get CAIRN_SECRET` against the throwaway | one stderr line, `revoked: …`, and nothing on stdout; the last secret and no secret are both refused, so the deployment is fenced, not opened; it still holds a `CAIRN_SECRET`, not the one revoked, which is never printed; and `secret.mjs` holds no `"remove"` or `"rm"` at all, since `convex env remove` would open the deployment to anyone with its URL |
| `verbs/init.mts` (refresh) | `rotate` into a file; a config written by hand as a machine set up before commands were stored, `e2e` with the secret `stale` and no `secretCmd`, and through it `cn ready`, `cn doctor`, `cn init --refresh`, `cn init --refresh --url x`, `cn init --refresh --name nope`, `cn init --refresh --secret-cmd 'cat <the file>'` and `cn ready`; then `rotate` into the file again, `cn ready`, `cn init --refresh`, `cn ready` and `cn doctor`; then `wrong` into the file and `cn init --refresh` | the stale secret is refused and `cn doctor` says `✗ e2e refused the secret this machine holds: cn init --refresh --name e2e takes the current one`; with no command stored or given it exits 1 naming `--secret-cmd`, `--url` exits 2, a name the file lacks exits 1, and none of them moves the file's bytes; the given command's secret lands, never printed, with the command beside it as `secretCmd`, the rest of the file as it was and mode 600, and the file answers; after the next rotate the stored command alone takes it and `cn doctor` ends `✓ secret accepted by e2e`; and a command printing a secret the deployment refuses exits 1, `nothing written`, and writes nothing |
| `backend/scripts/new-cloud.mjs` (files) | `newCloud` with a stand-in convex that writes `.env.local` as convex 1.46 does, in a directory and a HOME built in the run: the name `Bad_Name`; a name whose `.env.cloud.<name>.local` is there; no `.convex/config.json` in HOME, then one holding `not json`; then logged in, with the anonymous deployment in `.env.local` and `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOY_KEY` and `CONVEX_AGENT_MODE` in the environment, `acme`, the stand-in writing `dev:happy-otter-123 # team: acme, project: cairn-acme` and its URL; `beta` with `--team acme-co` and `--project worklist`; a convex that writes nothing and exits 1; one that writes a deployment and exits 1; one run with no `.env.local` beforehand; one that writes no `CONVEX_URL`; and one that throws after writing | the bad name and the name the checkout keeps exit 2, convex never runs and no byte moves; no login and an unreadable one exit 1 with `not logged in to Convex on this machine: npx convex login, from backend/, logs in; nothing created`, convex never running; `acme` exits 0, convex runs in that directory with `dev --once --configure new --project cairn-acme --dev-deployment cloud --skip-push` and none of the five variables that pick a deployment, `.env.cloud.acme.local` is the header, `# team: acme, project: cairn-acme`, the deployment and its URL, `.env.local` is byte for byte as it was, the lines are `creating …`, `created acme: dev:happy-otter-123 at …` and the `next:` line naming `#secret -- new acme`, and `pickClouds` reads the file as `dev:happy-otter-123`; `beta` adds `--team acme-co` last and says `in team acme-co`; nothing written exits 1 with `convex created nothing (exit 1); nothing written` and no file; a deployment made before a failure is written, exit 1, with `convex exited 1 after creating it; the file is written`; an `.env.local` that was not there is not there afterwards; no URL exits 1 naming the deployment and writes no file; and a throw rejects with `.env.local` put back |

A local deployment with no account, once, in another terminal:
`vp run @cairn/backend#dev`. It writes `backend/.env.local`, which is
gitignored, and after that `vp run @cairn/backend#verify` targets it too.
`#verify` runs `convex dev --once` through `scripts/local.mjs` and refuses while that
watcher holds port 3210, so
stop the watcher first, or take the watcher's own `Convex functions ready!` line after
a save as the push having happened: it pushes every change as it lands.

That watcher pushes to the local deployment alone. A backend change reaches the
cloud only through `vp run @cairn/backend#push:cloud`, which pushes every cloud
deployment the checkout keeps, one `backend/.env.cloud.<name>.local` each, named as
`cn init` names it, or the one named after `--`; `#dev:cloud` is the same watcher
against one of them, and both put `.env.local` back after themselves. `#dev`, `#verify` and `#codegen` pin
the anonymous deployment in the environment and rewrite
`backend/.env.local` when they find it naming anything else, saying so in one line.
The one path that still flips it is a bare `npx convex` in `backend/`, and the next
`vp run @cairn/backend#…` command corrects it.

Three things enforce the gate, so a session cannot skip it by forgetting:

- **Pre-commit** runs `vp check --fix` on staged files. `vp config` arms it once
  per clone, and a worktree's first Claude session arms it there; the hook lives in
  `.vite-hooks/`, the rule in `vite.config.ts`.
- **A Claude Stop hook** refuses to end a turn while a changed file fails
  `vp check`, and hands the output back. Once; it does not loop.
- **CI** runs `vp check`, every test, the web bundle and `vp run verify:e2e` on push
  and pull request.

## Layout

| Path | Package | Holds |
|---|---|---|
| `backend/convex/` | `@cairn/backend` | schema, functions, tests. `_generated/` is committed and never hand-edited. |
| `backend/scripts/` | | `run-convex.mjs` starts `convex` for the others, from the package's own binary, with the spawn, the signals and the exit status in one place, and holds `holdEnvLocal`, which puts `.env.local` back after a cloud command, and `convexSync`, for a caller that reads convex's output. `local.mjs` and `cloud.mjs` are the wrappers every `convex` command runs through: one pins the anonymous deployment, the other restores it. `throwaway.mjs` starts an empty one on its own ports and state, for the e2e rows. `page.mjs` builds `apps/web` for a deployment and uploads it there through `@convex-dev/static-hosting`, which serves it at the site root; `cloud.mjs --once` runs it after the push. `pushed.mjs` records on a deployment, as `CAIRN_PUSHED_FROM`, the commit its functions were pushed from, which `cn doctor` compares with its own checkout; `cloud.mjs` runs it between the push and the page. `clouds.mjs` names the cloud deployments this checkout keeps, one env file each, and picks which a command runs against. `secret.mjs` sets `CAIRN_SECRET` on the cloud deployment, `new`, `rotate` or `revoke` (`#secret`), and hands the value to 1Password or stdout. `new-cloud.mjs` creates a company's Convex project and its development deployment with nothing pushed, and writes its `.env.cloud.<name>.local` (`#new:cloud`). |
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
| `vp run dev:web` for working on the page, with `VITE_CAIRN_URL` naming the deployment, both it and `CAIRN_SECRET` in the gitignored `apps/web/.env.local`; the page a person opens is the one `#push:cloud` ships to the deployment's `.convex.site` URL | a secret under a `VITE_` name: vite inlines those into every bundle. `CAIRN_SECRET` reaches the dev server alone, a build defines it empty, and a built page asks for a paste that stays in that browser |
| `vp run codegen` after a schema or function change | editing `_generated/` |
| `vp dlx shadcn@latest add <component>` from `apps/web`, then point the new file's `cn` import at `@/lib/utils` | the npm package `cn` the generated import names: it installs a binary called `cn`, and here `cn` is the CLI |
| `vp config` once per clone, for the pre-commit hook | |

Node 24 comes from `.node-version`. vite-plus is pinned to the global binary's
version in `pnpm-workspace.yaml`; the reason is in `docs/design.md` §11, and the
two move together.

## Rules that hold from the first line

- **A verb is one Convex function** plus formatting, and where a verb takes an action
  word (`epic new`, `dep rm`) each action is one function; `cn update` runs one function
  per kind of id, `issues.update`, `epics.update` or `blockers.update`. The CLI never
  decides. If a verb needs logic, the logic goes in `backend/convex/` and gets a test
  there.
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

## Dogfood, the maintainer's loop

Every task is a cairn issue in cairn, on the cloud deployment `cairn` that
`~/.config/cairn/config.json` defaults to. What to do next is `cn ready` with
nothing set in the environment: claim it, journal as you go, and close it with
`--run 'vp run verify'`. `CAIRN_URL=http://127.0.0.1:3210` is the anonymous local
dev deployment that `#dev` and `#verify` push to and that carries a copy of the
worklist; the verify rows run against a throwaway of their own and never against
it.

The eleven slices mapped on 2026-09-17 went in that day as `cn-1` to `cn-11`
under `ep-1` to `ep-5`, and the file they came from is gone.

A contributor has no access to that worklist and does not need it. Problems and
proposals go through GitHub, as `CONTRIBUTING.md` says, and the maintainer files what
is taken on into cairn. A collaborator the maintainer has joined to `cairn`, as the
README's "Joining a worklist that exists" says, works this same loop.
