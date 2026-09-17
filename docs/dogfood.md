# Dogfood

The first issues live here until `cn create` works, then they are imported and this file
is deleted (docs/design.md §11). Everything after that is cairn issues in cairn.

Mapped 2026-09-17: eleven slices under five epics, each slice a few days of work and
each one true or not when it is done. The project is `cn`, so the first issue is `cn-1`.
Slices 1 to 4 are the loop in design §11 and the import; after slice 4 this file is gone
and the remaining seven are worked as cairn issues, claimed and closed with `cn`.

One issue per block. `epic` is required and is created by title on first sight; `after`
names the slices this one blocks on, as `blocks` edges; `design` and `acceptance` follow
the split in §3 — `design` is how, `acceptance` is what, and a criterion that would
change if the approach changed is a design note in a criterion's clothing. A field
continues on indented lines.

```
### <project>: <title>
epic:        <epic title>
priority:    <0-4>
after:       <title>, <title>          optional
design:      <how — approach, trade-offs; may change during implementation>
acceptance:  <what — verifiable yes/no; stable across sessions>
```

## The project

```
### project cn
name:  cairn: backend, cli, plugin
```

## The epics

| Epic | Outcome |
|---|---|
| Create to close | An agent creates, claims, journals and closes work on a local deployment, and cairn's own build is tracked in cairn |
| A session starts warm | A Claude Code session opens knowing what is ready, in progress and waiting, and the skill teaches the verbs |
| An epic tells the truth | An epic reports moving, stuck and waiting as facts, and reconcile keeps them true |
| Humans in the loop | What waits on a person is raised by agents and resolved by people, on a deployment only this company can reach |
| Invyte runs on cairn | Invyte's work lives in cairn, the beads trial is over |

## The slices

```
### cn: schema, ids, revision, events, and the first verbs
epic:        Create to close
priority:    0
design:      Transcribe design §3 into backend/convex/schema.ts as it stands, every
             table and index, so later slices add functions and never fields. lib/ids.ts
             mints from `counters` inside the mutation, creating the row on first use;
             `ep` and `bl` share the mechanism with the project slugs. lib/revision.ts
             is `expect(ctx, doc, revision)`: on mismatch it reads `events` by
             [issueId, revision] past the caller's number and throws
             ConvexError({ kind: "stale", id, yours, current, since }). lib/actor.ts is
             the validator; lib/events.ts is `record(ctx, …)` and every mutation calls
             it. Functions: projects.create/list, epics.create/list (ep-0 "Inbox" created
             on demand), issues.create (throws { kind: "epic-required", candidates } when
             no epicId is given, so cn prints the open epics), issues.list, show.get
             (dispatch on the id prefix). cn: project new|list, epic new|list, create,
             list, show; lib/actor.mts derives the actor per §12; doctor calls
             projects.list as its last check. One convex-test file per function file.
acceptance:  - `vp run @cairn/backend#verify` pushes the schema to the local deployment.
             - Two creates in one project mint cn-1 and cn-2; a create in a second
               project starts at 1; a test runs both.
             - A write carrying an old revision is rejected, and the rejection names
               the actor, the fields and the time of every change since.
             - `cn create` with no --epic exits 1 and lists the open epics, each in
               reference form.
             - Every list and show line starts with the reference form, and --json
               carries id and title.
             - `cn doctor` reports that the deployment answered.
             - The verify table in AGENTS.md has a row per new verb.

### cn: the lifecycle, claim to close with evidence
epic:        Create to close
priority:    0
after:       schema, ids, revision, events, and the first verbs
design:      issues.claim is first writer wins and idempotent for the same actor, sets
             in_progress, claimedBy and claimedAt, no lease; issues.release undoes it.
             issues.update takes revision and any of title, description, design,
             acceptance, priority, epicId, deferUntil, requires. journal.append is an
             insert that stamps lastActivity and takes no revision. issues.close takes
             the verification record and an optional follow-up ({ title, kind, requires })
             created in the same mutation with parentIssueId set; a record with exitCode
             other than 0 is refused unless it is the unverified shape with a reason.
             issues.drop requires a reason. cn: claim, release, update, journal, close,
             drop. `cn close --run '<cmd>'` runs the command with a 10-minute timeout
             and sends the exit code and the last 40 lines. `cn show` prints the last
             five journal entries and, with --history, the events.
acceptance:  - Two claims of one issue by two actors in one test: one wins and the other
               is told who holds it and since when.
             - A close with no record, a close with exitCode 1, and an unverified close
               with no reason are each rejected.
             - A close with a follow-up leaves both the closed parent and the open
               follow-up, linked, or neither.
             - A journal append lands while another actor holds a newer revision.
             - A drop with no reason is rejected.
             - `cn close cn-2 --run 'vp run verify'` on the local deployment stores the
               real exit code and output, visible in `cn show cn-2 --json`.

### cn: the graph and readiness
epic:        Create to close
priority:    0
after:       the lifecycle, claim to close with evidence
design:      edges.add stores one direction only: --blocked-by X on Y writes blocks X→Y.
             It refuses a `blocks` edge that would reach its own source, walking by_to.
             edges.remove deletes one row. ready.list is design §4 in one query and
             takes can[]; every ready row carries `cannot`, the requires this session
             lacks, and nothing is hidden. It already honours blockerLinks, whose verbs
             come in the blockers slice. cn: dep add|rm, ready; `can` from --can, then
             CAIRN_CAN, then config.json. `cn show` prints the neighbourhood from
             design §3.
acceptance:  - A blocks B: B is absent from `cn ready` until A is closed or dropped,
               and present the moment it is, with no recompute step in between.
             - A deferred issue is absent from ready until its date and still counted
               by `cn list`.
             - An issue requiring ios shows in `cn ready --can web` marked cannot: ios.
             - Ready is ordered by priority, then age.
             - `cn dep add` refuses an edge that would make an issue block itself, and
               says which path.
             - `cn dep rm` removes exactly the named edge.

### cn: dogfood, cairn's issues live in cairn
epic:        Create to close
priority:    0
after:       the graph and readiness
design:      A throwaway script, packages/cli/tools/import-dogfood.mts, parses the blocks
             in this file and calls the client: the project, then each epic by title,
             then each issue in order with `after` as blocks edges. Slices 1 to 3 are
             imported and then closed with `cn close --run 'vp run verify'`, the first
             real closes. The script and this file are deleted in the same pull request,
             and the Dogfood section of AGENTS.md says `cn ready`.
acceptance:  - `cn ready` on the local deployment lists exactly the unblocked remaining
               slices, in priority order, and `cn epic list` shows "Create to close"
               with 3 done.
             - docs/dogfood.md and the importer are gone, and AGENTS.md points at
               `cn ready` for what to do next.
             - This issue is closed in cairn with a verification record.

### cn: human blockers
epic:        Humans in the loop
priority:    1
after:       dogfood, cairn's issues live in cairn
design:      blockers.raise creates bl-N and a blockerLinks row, or with an existing
             blocker id only the row. blockers.list returns raised and waiting with the
             issues each holds. blockers.ack moves raised to waiting; blockers.resolve
             records resolvedBy, resolvedAt and the note; both reject actor.kind agent.
             cn: wait, waiting, ack, resolve; `cn show bl-3`; `cn show app-14` names
             its blockers.
acceptance:  - An issue with an unresolved blocker is absent from `cn ready` and present
               in `cn list`.
             - An agent actor cannot ack or resolve; a human can; the event says who.
             - One blocker attached to two issues frees both when resolved.
             - `cn waiting` lists each blocker in reference form with its issues, and
               --json carries it; with nothing waiting it prints nothing and exits 0.

### cn: the brief and the plugin
epic:        A session starts warm
priority:    1
after:       human blockers
design:      brief.get(can) returns the counts and heads of design §8: ready with the top
             three, in progress with actor and age, follow-ups filtered to what can[]
             covers, waiting as a count, and flagged as the blockers raised by the
             reconcile actor. `cn brief` lays it out under 20 lines and exits 0 silently
             with no deployment. The hook runs it. SKILL.md is rewritten to the verb
             table in design §10 with the three boundaries; a test in @cairn/cli reads
             SKILL.md and asserts every `cn <verb>` it names is registered. Slash
             commands: /cairn:ready, /cairn:pick (claim the top ready issue and show
             it), /cairn:handoff (a handoff journal entry), /cairn:close. The plugin is
             enabled in this repo and CLAUDE.md drops its "do not enable" line.
acceptance:  - `bash plugins/cairn/hooks/session-start.sh` prints under 20 lines against
               the local deployment, and nothing with CAIRN_URL unset, exit 0 both ways.
             - The follow-ups line shows only what can[] covers; `cn ready` still shows
               all of them, marked.
             - The hook completes in under one second against the local deployment.
             - Every verb SKILL.md names exists in `cn --help`, by test.
             - The plugin is enabled in this repo.

### cn: epic health and reconcile by hand
epic:        An epic tells the truth
priority:    1
after:       human blockers
design:      epics.health is one query: done and open count type task only, follow-ups
             separately; moving is the in_progress issues with actor and age; stuck is
             the open unclaimed issue silent longest, shown past 3 days; waiting is the
             unresolved blockers on its issues; last reconciled from the epic.
             `cn epic list` prints one health block per open epic and `cn show ep-3`
             one. epics.close refuses while a task issue is open and lists them;
             --drop --reason abandons. reconcile.run(epicId, owner) applies the five
             fact rules of design §7 and raises the three judgement rules as blockers
             owned by `owner`, records one event, stamps lastReconciledAt, and returns
             what it did and what it raised. Thresholds are the constants of §12.
             cn: reconcile.
acceptance:  - Two tasks done and one follow-up open reads "2 done · 0 open · 1
               follow-up", and each health line has a test.
             - Each of the five fact rules has a test that sets up the state and
               asserts the action and its event; each of the three judgement rules
               asserts one blocker raised and nothing else changed.
             - Reconcile twice in a row: the second run acts on nothing.
             - `cn epic close` with an open task issue is refused and names it.
             - `cn reconcile ep-1` on the local deployment prints what it did and raised.

### cn: a cloud deployment per company, and the secret that guards it
epic:        Humans in the loop
priority:    2
after:       dogfood, cairn's issues live in cairn
design:      lib/guard.ts wraps every public function: when the deployment env has
             CAIRN_SECRET, args.secret must equal it or the call is rejected in one
             line, and the argument is stripped before the handler; with no env var the
             check is skipped, so the anonymous local deployment stays open. config.json
             deployments gain `secret`, `cn` sends it on every call, CAIRN_SECRET in the
             shell overrides it for hooks. The secret is `openssl rand -base64 32`, set
             with `npx convex env set CAIRN_SECRET` per deployment. A personal cloud
             deployment is created, `default` points at it, and doctor's last check is
             that the secret is accepted. The install page in packages/cli/README.md
             covers a second machine.
acceptance:  - With CAIRN_SECRET set on the deployment, a call without the secret is
               rejected in one line and a call with it succeeds; a test covers both.
             - The local anonymous deployment works unchanged with nothing set.
             - `cn doctor` on a machine with only config.json passes against the cloud
               deployment.
             - Neither doctor nor any --json output prints the secret.

### cn: the reconcile sweep
epic:        An epic tells the truth
priority:    2
after:       epic health and reconcile by hand, a cloud deployment per company, and the secret that guards it
design:      crons.ts registers reconcile.sweep daily. The sweep runs the rules of
             reconcile.run over every open epic with owner from the CAIRN_OWNER env, and
             raises a nudge for every blocker past its nudgeAt, once per nudgeAt, by
             checking for a blocker.nudge event after that date. One event per sweep.
             Turned on only after reconcile by hand has been run across the dogfood
             epics for a week without a wrong action.
acceptance:  - A test drives the sweep with convex-test's scheduler over two epics and
               one past-due blocker: both epics reconciled, one nudge raised.
             - A second sweep the same day acts on nothing and raises nothing.
             - `vp run @cairn/backend#verify` accepts crons.ts.

### cn: Invyte runs on cairn
epic:        Invyte runs on cairn
priority:    3
after:       the brief and the plugin, a cloud deployment per company, and the secret that guards it
design:      A second cloud deployment for Invyte, projects app (app and backend), web,
             admin and proto. A one-off script over `bd export` JSONL imports the open
             beads issues only: beads epics become epics, parent-child becomes epic
             membership, everything without one goes to ep-0, blocks edges carry over,
             and every imported issue gets a journal entry naming its beads id. The
             plugin is enabled in the invyte worktrees through the shared
             CLAUDE.local.md, main/CLAUDE.md names the project per directory, and the
             beads plugin is disabled there.
acceptance:  - `cn ready` in an invyte worktree lists Invyte work with app-, web-, admin-
               and proto- ids.
             - The imported count equals `bd list --status open` on the day, and every
               imported issue's journal names its beads id.
             - The beads plugin is disabled in the invyte worktrees and nothing writes
               to .beads after the import.

### cn: apps/web, the human channel
epic:        Humans in the loop
priority:    3
after:       epic health and reconcile by hand, a cloud deployment per company, and the secret that guards it
design:      Vite and React in apps/web with convex/react, subscribing to epics.health,
             blockers.list and issues.list, so a page is never stale. It resolves and
             acks blockers, which is the moment identity auth arrives: Convex Auth or
             Clerk, chosen then, and the actor stops being an argument for calls that
             carry an identity. One URL per id, /app-14, renders what `cn show` prints,
             so the reference form gets its link. It imports the generated api from
             @cairn/backend directly; client.mts lifts to a package only if the web app
             needs more than that.
acceptance:  - The page lists open epics with the same health lines as `cn epic list`.
             - Resolving a blocker on the page makes its issue appear in `cn ready`
               without anything being restarted.
             - /app-14 renders the brief `cn show app-14` prints.
             - `vp run verify` checks and tests apps/web with the rest.
```
