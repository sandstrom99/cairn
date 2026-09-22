# cairn — design

An agent worklist on Convex. Task and project state that survives a session, is
shared by every agent and every machine, and has no sync layer because there is
nothing to sync.

Settled over an interview on 2026-09-16 and 2026-09-17, and revised the same
day when the surface question was reopened: one CLI and no MCP server (§10),
the reference form (§10), and the toolchain (§11). The solution was mapped on
2026-09-17: the concrete schema and the graph (§3), how the parts talk and the
verb-to-function table (§10), and the eleven slices, in cairn itself as `cn-1`
to `cn-11` since the same day (§11). **The repository skeleton is built;
nothing domain-specific is.** Every decision below is a decision, not a sketch;
where something was deliberately left open it says so under *Deferred*, with
the lean recorded.

---

## 1. What it is, and what it is not

| Is | Is not |
|---|---|
| Tasks, and the human waits attached to them | A wiki, a knowledge base, an index |
| One Convex deployment per company | A replicated store with a merge step |
| A graph agents read and write without asking | A place you go to do data entry |
| Epics as the human-facing view | A percentage-complete dashboard |

The size is the point. The reason beads was worth trying is that it does task
management and stops. Everything here is measured against whether it keeps
doing that.

### The three scenarios it exists to serve

1. **Autonomous.** Open a session, ask what there is to do, and an agent starts
   on something real without being briefed.
2. **Day to day**, where most of the time goes: where is this work, how does it
   break down, what is next.
3. **Reference from anywhere.** Name a task in a fresh session on any machine
   and everything needed is already attached to it. No handover, no pasting
   documents between sessions.

---

## 2. Settled decisions

| Branch | Decision |
|---|---|
| Topology | One Convex deployment **per company**. Invyte one, personal another. |
| Scope | Code work, plus anything that blocks code work. Nothing free-floating. |
| Knowledge | Tasks only. A finding is a journal entry; a decision is an issue. Nothing to index. |
| Hierarchy | `epic` floats above projects. `project` is a field on the **issue**. One epic spans app, web and admin. |
| Project | Coarse and arbitrary. `app` + `backend` are **one** project. A project may be a repo, or a prototyping effort. Not repo-shaped. |
| Ids | Project-prefixed: `app-14`, `web-22`. Epics `ep-7`, blockers `bl-3`, from one global counter each. All minted server-side inside a transaction from a `counters` table, never reused. `ep` and `bl` are reserved project slugs. |
| Actor | `{ name, kind: human \| agent }`, stored inline on every claim, journal entry, edge, blocker and event. Until auth exists `cn` supplies it as an argument, with `kind` set from whether Claude Code is the caller (§13). |
| Surface | One `cn` CLI over typed Convex calls. **No MCP server.** Revised 2026-09-17; the reasoning is in §10. |
| References | Every mention of an issue or epic carries id **and** title: `app-14 "fix connection retry"`. A bare id is a bug. §10. |
| Concurrency | Document revision on mutable fields. Journal entries and comments are inserts and never conflict. |
| Readiness | Three blocking edges: `blocks`, `blocked-by` (blocker entity), `defer-until`. Computed live. |
| Statuses | `open`, `in_progress`, `closed`, `dropped`. Blocked is derived, never stored. |
| Orphans | `epicId` is non-null. One inbox epic per deployment, `ep-0 "Inbox"`, is the escape hatch, and draining it is the first thing a review sitting looks at (§7). Revised 2026-09-17 from one inbox per project: an epic has no project, and `cn list --epic ep-0 --project app` is the per-project view for free. |
| Done | Closing takes a verification record: what was run and what it said, or `unverified` with a reason. |
| Residue | A `follow-up` issue with `requires[]`, linked to its parent, counted **outside** the epic denominator. |
| Fencing | Advisory in `ready` (returned and marked), filtered in the situation report. |
| Claiming | Atomic claim, no lease, idempotent per session: the actor's name and the Claude Code session it runs in, together (§5, 2026-09-22). `lastActivity` is stamped by every journal append. A silent claim is shown as silent and released by a person; nothing releases one alone (§7, revised 2026-09-22). |
| Blockers | Own table, own lifecycle. Agents raise them and may never resolve them. |
| Blocker channel | Pull-only: on request, and in-session when an agent hits one. The UI becomes the channel later. |
| Reconcile | Revised 2026-09-22: no automatic run. Facts are checked in the verb that makes or reads them; judgement is a sitting, `cn review`, a person and an agent going through one epic. §7. |
| Session start | A hook injects under 20 lines: counts plus the top of each queue. |
| Epic view | A health line — moving, stuck, waiting on you. Not a percentage. |
| Wiring | cairn ships its own Claude Code plugin, from `plugins/cairn` in this repo. |
| Layout | One pnpm workspace under vite-plus: `backend/` (Convex) + `packages/cli`. `apps/*` reserved. §10. |
| Bootstrap | Schema + create / list / ready / close / journal first, then dogfood within days. |

---

## 3. Data model

Drawn concretely on 2026-09-17, when the solution was mapped. This is what
`backend/convex/schema.ts` transcribes in the first slice: a field here is a
field there, an index here is an index there. Types are Convex validators:
`string`, `number`, a union of literals for an enum, `?` for optional, `Id<t>`
for a reference to another table.

Two ids on every issue, epic and blocker. `_id` is Convex's document id and is
what tables reference. `id` is the public one, `app-14`, `ep-7`, `bl-3`, minted
from `counters` inside the creating mutation and never reused. Nothing ever
prints `_id`.

```
projects      slug              string        the id prefix: app, web, cn. ep and bl are reserved
              name              string
              index by_slug [slug]

counters      key               string        "ep", "bl", or a project slug
              next              number        the next number to mint
              index by_key [key]

epics         id                string        ep-7. ep-0 is the one inbox
              title             string
              description?      string
              status            open | closed | dropped
              droppedReason?    string        the epic view returns it, like an issue's
              lastReconciledAt? number
              revision          number
              index by_public_id [id], by_status [status]
              ↑ no projectId: an epic is an outcome, not a place

issues        id                string        app-14
              projectId         Id<projects>
              epicId            Id<epics>     required, always
              title             string
              description?      string
              design?           string        HOW; may change during implementation
              acceptance?       string        WHAT; stable across sessions
              type              task | follow-up
              followUpKind?     verify | decide | cleanup       required iff type = follow-up
              parentIssueId?    Id<issues>    the issue whose residue this is
              requires          string[]      what a session needs: ios, android, web, device, decision
              status            open | in_progress | closed | dropped
              priority          number        0 is highest, 4 is backlog
              claimedBy?        actor
              claimedAt?        number
              lastActivity      number        stamped by claim, update, close and every journal append
              deferUntil?       number
              verification?     { command, exitCode, output, at, by } | { unverified, at, by }
              droppedReason?    string
              closedAt?         number
              revision          number
              index by_public_id [id], by_epic [epicId, status], by_project [projectId, status],
                    by_status [status, priority], by_parent [parentIssueId]

edges         from              Id<issues>
              to                Id<issues>
              type              blocks | related | discovered-from | duplicates | supersedes
              by                actor
              index by_from [from, type], by_to [to, type]

blockers      id                string        bl-3
              kind              approval | external-wait | decision | credential | purchase
              owner             string        who must act
              title             string
              whatResolves      string
              nudgeAt?          number
              status            raised | waiting | resolved
              raisedBy          actor
              resolvedBy?       actor
              resolvedAt?       number
              resolution?       string
              revision          number
              index by_public_id [id], by_status [status]

blockerLinks  blockerId         Id<blockers>
              issueId           Id<issues>
              index by_issue [issueId], by_blocker [blockerId]

journal       issueId           Id<issues>
              author            actor
              kind              finding | decision | handoff | evidence | question
              body              string
              index by_issue [issueId]                       ← insert only, never updated

events        kind              string        issue.create, issue.claim, edge.add, blocker.resolve, …
              actor             actor
              issueId?          Id<issues>
              epicId?           Id<epics>
              blockerId?        Id<blockers>
              revision?         number        the revision the target moved to
              changes           any           field → { from, to }, or the payload of the action
              index by_issue [issueId, revision], by_epic [epicId], by_blocker [blockerId]

actor      =  { name: string, kind: human | agent }          stored inline wherever it appears
```

`_creationTime` is Convex's own field and is the created-at everywhere. Index
names avoid `by_id`, which Convex reserves for its own. `epicId` is required:
there is no valid orphan state, and `ep-0 "Inbox"` is where an issue goes when
no epic fits.

### The graph

Nodes are issues. Everything else is a field on an issue or a row pointing at
one, and only three things make an issue not ready.

| Relation | Stored as | Blocks readiness |
|---|---|---|
| A blocks B | one `edges` row, `blocks`, from A to B. `blocked-by` is the same row read through `by_to`; only one direction is ever stored | while A is open or in progress |
| a human must act before B | a `blockerLinks` row from a `blockers` row to B | while the blocker is not resolved |
| B waits for a date | `deferUntil` on B | until the date |
| B is residue of A | `parentIssueId` on B: one parent, so a field and not an edge | never |
| B belongs to an epic | `epicId` on B | never |
| related, discovered-from, duplicates, supersedes | `edges` rows | never |

No epic-to-epic edges, no edge to an epic, no edge between blockers. `cn dep add`
refuses an edge that would make an issue block itself, walking `blocks` from the
target, because a cycle makes both ends unready forever and is a fact checkable
at write time. `cn show` prints the neighbourhood: what this blocks, what blocks
it, what it waits on, its parent and its follow-ups.

### Revision and events

Every mutable write to an issue, epic or blocker carries the `revision` the
writer read, bumps it by one, and writes an `events` row carrying the new
revision and what changed. A journal append is an insert: it stamps
`lastActivity` and writes an event, but neither takes nor bumps `revision`. A
stale write is rejected with the events since the writer's revision, which is
exactly the "what changed, who changed it and when" of §9, read from the table
rather than reconstructed.

What an event records is what a reader should see, not the patch that was written.
`lastActivity`, `claimedAt` and `closedAt` are housekeeping the row's own time already
says, and an actor travels by name. So a claim records `status` and `claimedBy`, a release
the same in reverse, a close `status` and a one-line summary of the verification whose
whole record stays on the issue, and a drop `status` and `droppedReason`; the helpers are
in `lib/changes.ts`, one per move, shared by every site that makes that move. Events
written before 2026-09-20 carry the raw patch for those four kinds, because nothing
migrates an audit trail, so whatever renders `changes` reads both.

Whatever renders `changes` renders every kind as a line and none as JSON, settled
2026-09-22 in `eventPieces` (`format.mts`), which `cn log`, `cn show --history`, a stale
write's retry lines and the web window's feed and history all go through. A field map is
its fields, `status open → in_progress`; a journal append its kind and first line; an
edge, a blocker's raise and an attach read relative to the id whose line it is, the way
§7 reads an edge from either end, `blocked by cn-1`, `waits on bl-3`, `holds cn-18`; the
resolve recorded on each issue a blocker held is the blocker and the note; a reconcile
run is what it did and who asked; a sweep how many epics it visited. A create has no
payload, since the reference leading its line already names what was created, except a
project, which has no reference to lead with and prints as its slug and name.

### The three content fields

Taken from the beads plugin verbatim, because it is the best product thinking in
that project:

| Field | Means | Changes? |
|---|---|---|
| `design` | **HOW** it will be built: approach, architecture, trade-offs | Yes, during implementation |
| `acceptance` | **WHAT** success is: outcome-focused, verifiable yes/no | No — stable across sessions |
| journal | What actually happened, entry by entry | Append only |

The test beads gives: *"If you rewrote the solution using a different approach,
would the acceptance criteria still apply? If not, they're design notes, not
criteria."* `- [ ] Use batchUpdate approach` is design wearing a criterion's
clothes; `- [ ] Formatting is applied atomically` is a criterion.

**What beads calls `notes` is deliberately absent.** Its own docs define it as
*"current state, not cumulative"*, so it is rewritten on every handoff. That is
how a "tested on device" update disappears, and `--append-notes` dropped 3 of 16
writes on top of it. The journal replaces it and cannot lose an entry, because
an append is an insert.

### Journal entry kinds

`finding`, `decision`, `handoff`, `evidence`, `question`. Every entry carries an
author and a timestamp, and every append stamps the issue's `lastActivity`. Where
§9 says "comments", it means these: there is no second table.

### Statuses

`open` · `in_progress` · `closed` · `dropped`

- **Blocked is derived from edges and never stored.** beads has both a manual
  `blocked` status and a separate denormalised `is_blocked` column, and that
  split is the confusion at the centre of its readiness code. Dependency-blocked
  issues in beads stay `open`; `bd query --help` says so outright.
- **Deferred is a `deferUntil` date, not a status.** A deferred issue still
  appears in the situation report count, so it cannot go dark. beads' dated
  defer once failed to wake and left 241 beads invisible, P1s included.
- **`dropped` is closed-without-doing**, kept distinct so rollups stay honest.

---

## 4. Readiness

The one genuinely hard query. In full:

```
ready(capabilities) =
    status = 'open'
    AND no open `blocks` edge into it
    AND no unresolved blocker attached
    AND (deferUntil is null OR deferUntil <= now)
  ordered by priority, then age
  each row marked with any requires[] this session cannot satisfy
```

Computed live. **No `isReady` column, no `recompute` command.** beads spends
roughly 2,000 lines here, of which about 800 exist only to repair a
denormalised flag after a three-way merge — a category that does not exist on a
single authoritative deployment.

In Convex terms it is one query function, `ready.list`: the candidates through
`by_status [open]`, every `blocks` edge into them through `by_to` with the
blocking issue's status, every `blockerLinks` row through `by_issue` with the
blocker's status, then the date test and the sort. Every read is an index
lookup, and at the sizes here (Invyte's beads graph is 136 issues) the whole
thing touches a few hundred documents. Convex caps one query at 16,384
documents read; that is the ceiling to watch, about two orders of magnitude
away.

Edges that block: `blocks`, `blocked-by`, `defer-until`. Epic membership does
**not** block. `related`, `discovered-from`, `duplicates`, `supersedes` are
context and never touch readiness. For reference, beads has 19 dependency types
and only 4 affect readiness — that ratio is the warning.

---

## 5. Lifecycle

```
create ──→ claim ──→ journal… ──→ close(verification)
                                        │
                                        └──→ follow-up?
```

**Create.** `epicId` required; the create tool hands back candidate epics so
choosing is cheaper than dumping into `inbox`.

**Claim.** Atomic, first writer wins, idempotent for the same session. Sets
`status = in_progress` and `claimedBy`. **No lease and no TTL** — a lease
forecloses the cooperative behaviour that is the whole point. `lastActivity` is
stamped by every journal append, so heartbeat costs the agent nothing. A claim
silent past the threshold in §12 is shown as silent in the brief and in
`cn review`, and a person releases it: nothing releases a claim on its own (§7).

"The same session" is the actor's name and its `session` together (§12). Every
Claude session on a machine is the same `wsl/claude`, so on the name alone two
parallel sessions both won one claim and, after compaction, nothing could say
which claim was this session's. A second session of the same name is refused
like any other claimant, told it is held `in another session`; a shell with no
session is not the session that holds it either. Release and the human override
stay on the name: another session of the same name may hand a claim back, and
a person may release anybody's (2026-09-22).

**Close.** Takes a verification record. In beads, close is a free-text
`close_reason` that nothing checks, which is exactly how work gets marked done
without ever being confirmed. Here `cn close --run '<command>'` runs the command
itself and records the command, its exit status and the tail of its output; the
agent never types the output in, so there is nothing to fabricate. `issues.close`
refuses a non-zero exit unless the close is `--unverified` with a reason. A
follow-up given on the same close is created in the same mutation, so a parent
never closes without its residue existing.

### Follow-ups: residue that must not hang

The problem, in Balder's own two cases:

- A change verified on Android and web, but this machine is WSL and cannot run
  iOS. Very likely fine. It should reach **the next iOS session** by itself.
- A decision that surfaced mid-implementation and might change direction. Merge
  now, revisit later. Not blocking, but it must not evaporate.

Both are the same shape, and it is **routing, not blocking**. The iOS check is
not waiting on a dependency; it is waiting on a session that has an iOS device.

```
app-14  fix connection retry          closed ✓
        verified: android, web
        residue → app-22

app-22  [follow-up · verify]          open
        requires: ios
        parent:   app-14
        confirm retry path on a device

epic:  12 done · 3 follow-ups open
       (follow-ups are not in the denominator)
```

- `type: follow-up`, with `followUpKind` of `verify`, `decide` or `cleanup`.
- `parentIssueId` links back to what produced it.
- `requires[]` declares what a session needs in order to finish it.
- **Counted outside the epic denominator**, so "12 done" keeps meaning what it
  says.
- The parent closes. Nothing hangs half-finished.

### Capability fencing, and the bug not to repeat

A session declares what it has; `ready` marks what it cannot do.

**Advisory in `ready`, filtered in the situation report.** Everything is
returned and marked, so a config mistake can never hide work. The 20-line
session-start report leads only with follow-ups this session can actually
finish.

> beads has this and it is broken: **`--label-any` is silently dropped by
> `bd ready` on every backend**, so a worker fencing itself to one lane claims
> from another and believes it is fenced. It fails *open*, quietly. Advisory
> marking sidesteps the failure mode rather than reimplementing it.

Vocabulary starts tiny — `ios`, `android`, `web`, `device`, `decision` — and
grows only when something is actually fenced.

---

## 6. Human blockers

Their own table, their own lifecycle. Not a status, not an issue type, not an
edge property.

```
blockers    kind          approval | external-wait | decision | credential | purchase
            owner         who must act
            title         what is being waited on
            whatResolves  what would end it
            nudgeAt       optional date
            status        raised → waiting → resolved
            raisedBy      which agent raised it
```

- One blocker can block **many** issues, through `blockerLinks`. `cn wait <issue>`
  raises a new one, `bl-3 "App Store review"`, or attaches an existing one with
  `--on bl-3`; both are `blockers.raise`.
- **Agents raise them. Agents may never resolve them.** `blockers.resolve` and
  `blockers.ack` reject an actor of kind `agent`. Until auth exists that is a
  guardrail against an honest agent, not a lock against a lying one, and that is
  enough for the throwaway window.
- They do not appear in any agent work queue, and they are not counted in epic
  progress — otherwise "7 of 10" starts counting work no agent can do.

**Channel: pull-only.** On request (`cn waiting`), and in-session when an agent
hits one. No push, no email, no GitHub mirror. The UI becomes the real channel
later, and that is the accepted cost: a blocker raised Friday is not seen until
the next session.

---

## 7. Reconcile

Revised 2026-09-22. The first version of this section had three mechanisms
arriving in order: write-time invariants, a reconcile skill run by hand per
epic, and a scheduled sweep once the skill had earned trust. The skill was built
(`cn reconcile`, 2026-09-17) and the sweep after it (2026-09-20, off until an
owner was set), and in four days of daily use neither ran on the worklist: every
epic read `never reconciled`, readiness was right the whole time, and the one
visible residue was `cn show` listing two closed issues as blocking `cn-10`.
Nobody reached for a tidy-up command, and an unattended one that writes to the
worklist was never trusted enough to switch on. So the answer to clutter is two
mechanisms, and neither runs on its own:

1. **Facts are checked where they are made or read.** A rule with one right
   answer does not need a run; it lives in the verb that makes the state or the
   one that reads it, beside the write-time invariants that were always first:
   `epicId` non-null, close requires a verification record, `dropped` requires
   a reason.
2. **Judgement is a sitting.** `cn review <epic>` is one read that lists what a
   person and an agent should look at together, and `/cairn:review` walks it
   with them. It writes nothing; every action taken in the sitting goes through
   the verb that exists for it, by the person or the agent, in the log under
   their own name.

### Where each rule went

| Rule, as first written | Now |
|---|---|
| `blocks` edge pointing at a closed issue: drop it | `cn show` reads it as done. Readiness ignored it already; the edge stays as history |
| Epic with every child closed and no open follow-ups: close it | `cn close` on the last open issue answers that the epic can close and prints the `cn epic close` line. An offer, never a close |
| Closed `unverified` with no follow-up: spawn one | Inside `issues.close`, in the same mutation |
| Issue in the inbox, exactly one epic matches: reparent it | At `cn create`: an issue bound for the inbox whose parent or discovered-from sits in exactly one open epic goes there, and the answer says so |
| Claim with no activity past 24 hours: release it | The brief and `cn review` show it as silent. A person releases it. **Nothing releases a claim on its own** |
| Two open issues, same epic, near-identical title: raise | `cn create` hands the matches back before the duplicate exists, and `cn review` lists any that got through |
| Inbox item older than 7 days: raise | A `cn review` line |
| Blocker past its `nudgeAt`: raise | A `cn review` line |

### What the sitting reads

`review.get(epicId)` is one query, and every line it returns is in the reference
form, with what to do about it left to the two reading it: near-identical
titles, inbox items past 7 days, blockers past their nudge date, claims silent
past 24 hours, closes marked unverified with no follow-up beside them, `blocks`
edges into finished issues, and whether every issue is finished so the epic can
close. Running it twice reads the same; nothing it prints is consumed by
printing it. The thresholds are the constants of §12.

### What this rules out

- **A sweep, a cron, an owner in the environment.** The deployment makes no
  write that is not inside a verb somebody ran. `reconcile.sweep`, `crons.ts`
  and `CAIRN_OWNER` go, and with them the `cairn/reconcile` actor: nothing acts
  under a name that is not a person or a session.
- **`cn claim` taking over a silent claim.** A long session that forgot to
  journal keeps its work; the person sees `silent 26h` and decides.
- **`cn review` writing anything**, a blocker included. A finding it prints is
  a finding; if the person wants it tracked, that is `cn wait`, by hand, under
  their name.

`cn-30 "is an automatic reconcile the right direction, or is it a person and an
agent going through an epic together"` is the decision; `cn-43 "reconcile
becomes a sitting: the fact rules move into close, create and show, cn review
replaces cn reconcile, and the sweep is deleted"` is the implementation, the
last issue of the backend refactor epic. Until it lands, `cn reconcile` and the
switched-off sweep are still in the tree, and §3, §8's example and §10's table
describe them.

**There is no `bd triage`.** beads' hygiene surface is `bd stale`, `bd orphans`,
`bd lint`, `bd preflight` and `bd human` — and `bd orphans` finds *broken
dependency edges*, not epic-less issues. The thing that actually goes wrong has
no command at all.

---

## 8. The two human-facing views

### Session start

A hook injects **under 20 lines**:

- ready count, and the top 3 by priority
- in progress, with actor and age, marked `yours` where the claim is this session's
- follow-ups this session's capabilities can finish
- waiting-on-you as a **count only**
- a claim silent past the threshold, marked `silent 26h`

Scenario 1 answers without a tool call; scenario 2 starts warm. With `cn` on
PATH and no deployment configured the hook prints two lines pointing at
`/cairn:init` instead of nothing, because a machine that has `cn` installed
means to use it. With one configured that does not answer, or refuses the
secret, it prints one line, `cairn: <name> did not answer; cn doctor says why`,
settled 2026-09-22: until then the hook swallowed every failure, so a dead URL
or a wrong secret started a session exactly like a machine with nothing
installed, and the skill taught only two states. The hook never diagnoses; `cn
doctor` does, and the line names it. The hook's 5 s timeout in the manifest is
what bounds a URL that never answers at all. One query, `brief.get(can)`,
returns the numbers and the heads; `cn brief` lays them out:

```
cairn · invyte · wsl/claude can web android
ready 7        app-31 "retry on reconnect" P1 · web-12 "invite landing copy" P1 · app-40 "…" P2
in progress    app-14 "fix connection retry" wsl/claude 2h · yours · web-9 "…" mac/claude 3d · silent 26h
follow-ups     app-22 "[verify] confirm retry path on a device" (web)
waiting on you 3
flagged        2 inbox items older than 7d
```

`yours` and `silent 26h` are the deployment's facts, not the line's: `brief.get`
takes the caller's actor and marks a claim `mine` on the same test `issues.claim`
is idempotent on (§5), and `silentSince` is the last activity of a claim silent
past the threshold in §12. The hook passes the session to `cn` by appending
`export CAIRN_SESSION=<session_id>` to the file Claude Code sources before every
Bash command of the session, `CLAUDE_ENV_FILE`, which it names to the
SessionStart hook alone; a human terminal has no session.

> **The trap to avoid.** `bd prime` is exactly this, and it grew until it
> contradicted the skill shipped beside it: prime says *"Prohibited: Do NOT use
> TodoWrite"* while the plugin's own resources spend ~470 lines teaching when
> TodoWrite is the right tool. Prime wins, because it is a hook. **Rules belong
> in the skill, which loads on demand. The hook carries state, never doctrine.**

### Session end

The other end is one line, not a report. Added 2026-09-22. When a session tries
to end a turn holding a claim with nothing journaled for longer than the
threshold in §12, a Stop hook hands it back `cn brief --unjournaled`:

```
you hold cn-27 "retry on reconnect", last journal 3h ago
```

One clause per such claim, on one line, or nothing at all; `claimed 2h ago,
nothing journaled since` where the claim is newer than the newest entry.
`brief.get` states the fact as `unjournaledSince` on the in-progress row,
counted from the later of the claim and its newest entry, so a claim taken a
minute ago over an issue journaled hours ago is not quiet yet, and the line
prints what the deployment marked and decides nothing.

It goes back as `additionalContext`, because at Stop plain stdout reaches the
debug log and not the model, and `decision: block` reaches the model as a hook
error; hook feedback continues the turn once with the fact in front of the
model. The hook honours `stop_hook_active`, so it fires once per stop and a line
the model chose to leave alone cannot hold the turn open, and it exits 0
whatever happens. The same rule as the start: state, never doctrine. What to do
about the line is the skill's.

### Epic health

Not a percentage. A percentage hides everything that matters — an epic at 95%
frozen for a month reads better than one at 40% advancing daily.

```
ep-3 "Ship invite links"  12 done · 4 open · 3 follow-ups
  moving   app-31 "retry on reconnect" wsl/claude 2h
  stuck    web-12 "invite landing copy" silent 9d
  waiting  bl-3 "confirm the invite copy" · owner balder
```

Each line is a fact with a query behind it, `epics.health`, and a line with
nothing behind it is not printed: a fresh epic is its first line alone. `done`
and `open` count tasks, follow-ups sit beside them (§5), `moving` is every claim
with who and since when, `stuck` is the one open unclaimed issue silent longest
once past the threshold in §12, and `waiting` is every unresolved blocker on the
epic's live issues.

### The web window

Settled 2026-09-21 on a static mock, `docs/mock/overview.html`, before any
component was written. The page a person opens answers two questions: what are
the agents doing, and does anything need me.

**A row is one of cn's lines, typeset.** The page does not print the padded
lines a terminal gets, and it does not word anything a second way either.
`format.mts` builds each line from pieces, `healthParts`, `blockerParts`,
`logParts`, `stateParts`, `proofParts` and `changePieces`, and the line is
those pieces joined; the page sets the same pieces in columns. The separators cn prints stay in the markup,
pale or not drawn, so the text of a row is the line. `apps/web/src/rows.test.tsx`
holds every row to that, which is how "the same health lines as `cn epic list`"
is checked rather than hoped for. Ruled out: a mono dump of the lines with the
references turned into links, which reads as a screenshot of a terminal.

The screens are the Overview at `/`, Issues, one page per id (`/app-14`,
`/ep-3`, `/bl-2`) that renders what `cn show` prints, and the Log. Where the
deployment will not answer, the page shows its line and a field for the secret.
A picker for switching deployments in the page was planned here and taken out
on 2026-09-21: which deployments a browser knows about is part of running cairn
for more than one person, and that is deferred whole (§13). The Overview's headline is the brief
said as a sentence, waiting first, in a fixed order, with a clause that has
nothing behind it set back in grey: `1 waiting on you. 2 in progress. 3 ready.`
That wording is the page's own, in `apps/web/src/brief.ts`.

A page for one id is `cn show` with room. An issue opens with its state,
`stateParts`, the head of the brief's status line: `moving balder/claude 2h`,
`waiting on bl-4 "…"`, `blocked by` the ends still live, `stuck silent 9d`,
`deferred until 2026-10-01`, `closed 2h ago`, `dropped 2h ago`, or `open`. Then
the brief's labelled lines as a table, `issueFacts`, the proof a close stored
and the reason a drop gave among them, and a `blocks` edge with a finished end
marked `done` rather than dropped (§7); then everything written into it printed
whole where the brief keeps a first line, the output the proof carries among
that, then its journal, with its own history in the column where the Overview
has the feed. An epic is
its health and every issue under it, the finished ones included, which is more
than `cn show ep-3` lists and is what a person opening an epic came for. Getting
around is the point of the page: every reference anywhere is a link, an issue
names its epic above its title and steps to the issue before and after it in
the epic's order, the rail marks the epic on screen, and one button copies the
reference form, `cn-26 "apps/web, the read-only window"`, because that is what a
person pastes into a session to say which work they mean.

Four routes do not get a router. The path is the state, and one listener turns
every plain same-origin link into `history.pushState`, so components write
`<a href>` and nothing else: links work with a modifier held, render in a test
with no router around them, and keep the live subscriptions when clicked
(`apps/web/src/location.ts`). Whatever hosts the built page has to answer every
path with `index.html`.

The look, and what each choice rules out:

- **Glass only on what floats**: the rail, the feed, the jump bar, a dialog.
  Content sits on near-solid paper and scrolls under the glass. Not a glass card
  per epic: blur on every card is slow and reads white on white.
- **Chroma means state.** Moving is teal, stuck is amber, waiting is violet, and
  a violet bloom sits behind the headline only while something waits on the
  reader. A deployment where nothing is happening is grey and white. Nothing is
  coloured to decorate, the ground included: it is light falling across a wall,
  in greys, there for the glass to stand over. Literal stones were tried and
  rejected.
- **One face, Recursive**, from sans to mono along its MONO axis. Prose in sans;
  ids, commands and verification records in mono, because they get pasted into
  a terminal.
- **A jump bar where a chat page has its composer.** Type an id or part of a
  title and go. It reads, like everything else on the page, and it is where
  `cn-11`'s answers will be typed.
- **One motion nobody asked for**: an event arriving over the subscription lands
  in the feed with a sheen. It is the proof that no reload brought it.
- Light first. Dark is a second set of values for the same tokens.

Components are shadcn's, on Tailwind 4 and Radix, restyled through the tokens in
`apps/web/src/index.css`.

---

## 9. Concurrency

The premise: **conflict should be something an agent reasons about, never a
system failure a human is paged for.**

- Every write to a mutable field carries the `revision` the agent read. A stale
  write is **rejected with what changed, who changed it and when** — the agent
  re-reads, decides, and retries.
- **Journal entries and comments are inserts. They always land.** An agent
  recording a finding can never lose it.
- Ids are minted server-side inside a serializable transaction.
- Convex mutations are OCC with automatic retry, so a concurrent close is
  retried rather than lost.

### The three beads failures this deletes

| Upstream | What happens | Measured |
|---|---|---|
| gastownhall/beads#4796 | Two machines mint the same child id before syncing; the merge cannot settle and a pull dies on `child_counters` | Open since 2026-07-14, unfixed in 1.2.2. It happened here on 2026-09-15. Recovery is `bd rename` on the machine that has not pushed |
| gastownhall/beads#4767 | `bd close` reports success and does not persist under concurrent agentic load | 7 of 8 closes lost in one 8-worker run |
| gastownhall/beads#3964 | `bd update --append-notes` drops writes in rapid succession | 3 of 16 persisted. Labels survive, notes do not |

These are not bugs to fix. They are what a replicated merge-based store costs.
On one authoritative deployment they are categories that do not exist: no
replicas, so no merge, so nothing to reconcile.

---

## 10. Surfaces

One surface. Revised 2026-09-17; the original design had an MCP server beside
the CLI, and the reasons it went are below.

| Surface | For |
|---|---|
| **`cn` CLI** | Every agent, every hook, every jq pipeline. One verb is one Convex function call plus formatting: the CLI holds no logic. Where a verb takes an action word (`epic new`, `dep rm`), each action is one function. |
| **Claude Code plugin** | Skill, SessionStart and Stop hooks, slash commands. Ships from `plugins/cairn` in this repo so it versions with the code and installs anywhere, including cloud runners. |
| **`apps/web`** | The human's window, in two steps, split 2026-09-20. First a read-only page over `convex/react` subscriptions, which ships on the deployment's shared secret pasted once into the browser. Then the human channel, acking and resolving blockers from the page, which is where identity auth arrives (§13). The skeleton, one live query inside the gate, landed 2026-09-20. What the page looks like and how it stays cn's words is §8, "The web window". |

### Why not an MCP server

- The type safety MCP would give is already there. `cn` calls `api.issues.create`
  through Convex's generated `api` object, so a verb whose arguments drift from
  the function's validator fails `vp check`, not the agent.
- An MCP server is a second surface with the same verbs, a process per session
  and a registration step per agent. The CLI is needed regardless, for hooks and
  crons.
- The beads plugin's own slash commands instruct the agent to *"use the beads
  MCP `create` tool"*. `bd mcp` returns `unknown command` and there is no
  `mcpServers` key anywhere in the plugin. Agents fell back to Bash silently and
  nobody noticed: the shell is the surface that gets used.
- Convex's own MCP server (`convex mcp start`) is registered in this repo's
  `.mcp.json` for *developing* cairn: tables, logs, function runs. That is a dev
  tool, not the agent surface.

If a second consumer ever needs the typed client — a web app, an MCP wrapper —
it imports `packages/cli/src/lib/client.mts`, and that module lifts into its own
package then, not before.

### How the parts talk

```
 a Claude Code session                               one Convex deployment per company
 ┌────────────────────────────────────┐              ┌────────────────────────────────────┐
 │ hooks (start, stop) ──  cn brief … │              │ schema.ts     the tables of §3     │
 │ SKILL.md           teaches the verbs│              │ issues.ts  epics.ts  journal.ts    │
 │ /cairn:* commands  ──  cn …        │  ── HTTPS ─► │ edges.ts  blockers.ts  ready.ts    │
 │ the agent          ──  cn <verb>   │  one typed   │ show.ts  brief.ts  reconcile.ts    │
 └────────────────────────────────────┘  call per    │ projects.ts  events.ts  crons.ts   │
       cn  (Node 24, .mts, no build)     verb        │ lib/  ids · revision · actor ·     │
       config.mts → url, secret, can[]               │       events · guard · verification│
       actor.mts  → { name, kind }                   │ crons ── reconcile.sweep, §7       │
       client.mts → ConvexHttpClient                 └────────────────────────────────────┘
       verbs/*    → api.<module>.<fn> → ref()                        ▲
                                                                     │
 apps/web, later  ──  convex/react subscriptions to the same functions
```

- **Every hop is one typed Convex function call over HTTPS.** `cn` uses the HTTP
  client: one request, no socket, so a hook or a cron costs one process and one
  round trip. The web app uses the React client and subscribes to the same
  functions; nothing is written twice.
- **Every mutation takes `actor`**, and on a mutable field `revision`. Every
  query that can be fenced takes `can[]`. Until auth exists the actor is an
  argument `cn` fills in (§13).
- **A subscriber sends its own clock.** Convex re-runs a subscribed query when data it
  read changes, never because time passed, so the stuck line and a `deferUntil` would go
  stale on a page left open. Every public query that reads the clock takes an optional
  `now` (`lib/clock.ts`): `cn` asks once and leaves it out, the page sends the current time
  rounded down to the minute, so it re-asks once a minute and the query cache holds in
  between. Nothing validates it; a wrong `now` misleads only the caller that sent it.
- **The deployment is where anything decides.** `ready` computes, `close`
  validates, `review` reads, `create` hands back candidate epics. `cn` parses
  arguments, runs the one command `cn close` proves with, and formats through
  `ref()`.
- **There is no daemon on any machine, and no cron.** Revised 2026-09-22: the
  sweep is deleted (§7). Every write the deployment makes is inside a verb
  somebody ran.
- **Two channels back to the human**: `cn waiting` and the brief's count now,
  `apps/web` later.

### The verbs

One row per verb, one function per row. This table is the contract the skill
teaches and the `--help` headers restate.

| Verb | Function | |
|---|---|---|
| `cn brief` | `brief.get` | query |
| `cn ready [--can ios web …]` | `ready.list` | query |
| `cn list [--project] [--epic] [--status] [--mine]` | `issues.list` | query |
| `cn show <id> [--history]` | `show.get`: issue, epic or blocker by prefix | query |
| `cn log [--limit N] [--before <date>]` | `events.recent`: what happened across the deployment, newest first, each event with the issue, epic or blocker it names as id and title; an edge, recorded on both of its ends for their histories, is listed once, on the end that leads its sentence | query |
| `cn create --project app --epic ep-3 --title … [--priority] [--design] [--acceptance] [--type follow-up --kind verify --parent app-14 --requires ios]` | `issues.create` | mutation |
| `cn claim <id>` · `cn release <id>` | `issues.claim` · `issues.release` | mutation |
| `cn update <id> --revision N [--title] [--design] [--acceptance] [--priority] [--epic] [--defer-until] [--requires]` | `issues.update` | mutation |
| `cn journal <id> --kind finding <body>` | `journal.append` | mutation |
| `cn close <id> --revision N --run '<command>' \| --unverified <why> [--follow-up <title> --kind verify --requires ios]` | `issues.close` | mutation |
| `cn drop <id> --revision N --reason …` | `issues.drop` | mutation |
| `cn dep add\|rm <id> --blocked-by\|--blocks\|--related\|--discovered-from\|--duplicates\|--supersedes <id>` | `edges.add` · `edges.remove` | mutation |
| `cn wait <id> --kind approval --owner balder --title … --resolves … [--nudge <date>]` · `cn wait <id> --on bl-3` | `blockers.raise` | mutation |
| `cn waiting` | `blockers.list` | query |
| `cn ack <bl>` · `cn resolve <bl> --note …` | `blockers.ack` · `blockers.resolve` | mutation, human only |
| `cn epic new\|list\|close <id> --revision N [--drop --reason …]` | `epics.create` · `epics.list` · `epics.close` | |
| `cn project new\|list` | `projects.create` · `projects.list` | |
| `cn reconcile <epic> [--owner <who>]` | `reconcile.run` | mutation |
| `cn doctor` | `projects.list`, as the ping | query |
| `cn init --name … --url … [--secret-cmd …] [--can …] [--host …] [--default]` | `projects.list`, as the check; then it writes this machine's config | query, local |

Every read verb takes `--json`. Every list line starts with the reference form.
On a stale-write error every write verb prints the events since the caller's
revision and the command to retry with.

### The reference form

Every mention of an issue or epic, in a reply, a journal entry, a commit or a
`cn` output line, carries its id **and** its title:

    app-14 "fix connection retry"

A bare `app-14` is a bug in the skill or the CLI. Beads ids like `invyte-wu03.2`
gave the reader nothing to hold on to, and a session's worth of "working on
wu03.2" was unreadable a day later. `cn show <id>` prints a ten-line brief,
every list line starts with the reference form, and `--json` carries both
fields. A URL into the web app slots in behind the same form later. The form is
spelled in one place, `ref()` in `packages/cli/src/lib/ref.mts`.

### Repo layout

```
backend/convex/         schema, queries, mutations, tests   (@cairn/backend)
packages/cli/           cn, no build step                    (@cairn/cli)
plugins/cairn/          the Claude Code plugin
docs/                   this file
apps/web/               the web window, Vite and React           (@cairn/web)
```

One pnpm workspace under vite-plus. The CLI depends on `@cairn/backend` through
`workspace:*` and imports the generated `api` by package name, which is the
reason for a monorepo at all.

---

## 11. Build order

The first slice is the five mutations and the one hard query:

```
schema · create · list · ready · close · journal
```

Then dogfood **within days**, in this repo, on cairn's own construction. The
build was mapped into eleven slices under five epics on 2026-09-17, first in a
`docs/dogfood.md`, and the same day `create` worked they were imported as
`cn-1` to `cn-11` under `ep-1` to `ep-5` and the file deleted. The first four
were the loop above and the import; everything after that is cairn issues in
cairn, and `cn ready` says what is next.

The accepted cost: a short throwaway window, and early schema churn means
migrating your own dogfood data.

Invyte comes later, once it is mature — and that is also when the storage and
binding questions below get settled against real usage rather than guessed at
now.

Order of magnitude: **2–5k lines**. Measured 2026-09-22: about 10.5k without
tests and 17.5k with, across the backend, `cn`, the plugin, the page and the
scripts.

### Toolchain

Chosen 2026-09-17 and verified on this machine the same day. Everything runs
through vite-plus (`vp`): one binary per machine, and it brings its own Node.

| | |
|---|---|
| Runtime | Node 24, pinned by `.node-version`. `cn` runs its `.mts` source directly: Node strips the types, so there is no build step and the checkout is the install. |
| Types | TypeScript 5.9 installed, for `convex dev`'s own check and vite-plus's peer range. `vp check`'s type check is the native compiler regardless. Erasable syntax only in `packages/cli`: no enums, namespaces or parameter properties. |
| Packages | pnpm, driven by `vp install`. `workspace:*` between packages; `@cairn/cli` imports the generated `api` from `@cairn/backend` by name. |
| Check | `vp check`: oxfmt, oxlint, and a type-aware check across every tsconfig. Markdown and yaml are left as written. |
| Tests | `vp run -r test`: vitest per package. The backend runs `convex-test` in the edge runtime, which is closer to Convex's own than Node is. |
| The gate | `vp run verify` is check plus every test, about a second. A pre-commit hook (`vp config`, once per clone) formats and lints staged files, a Claude Stop hook refuses to end a turn with a changed file failing `vp check`, and CI runs the same gate. `AGENTS.md` carries the per-change table. |
| End to end | `vp run verify:e2e` runs the per-verb rows of `AGENTS.md` with the real `cn` against a throwaway anonymous local deployment on its own ports and state directory, empty by construction and deleted afterwards. Decided 2026-09-17: automated verification never targets a deployment agents work in. A Convex preview deployment is the later option. |
| Local backend | `CONVEX_AGENT_MODE=anonymous npx convex dev` runs a local deployment with no Convex account, and is how `convex/_generated` was first produced. `convex codegen` alone refuses to run without a deployment. |
| CI | `voidzero-dev/setup-vp`, then the gate, `vp run @cairn/web#build` and `vp run verify:e2e`; none needs a Convex account. |
| Web | `apps/web` is Vite 8 and React 19 through the same pinned vite-plus: `vp dev`, `vp build` and `vp test run`, with `@vitejs/plugin-react` 6 for Fast Refresh. Proved on 0.1.24 on 2026-09-20, which until then had only run check and test here. Its tests render to a string with `react-dom/server`, so the suite carries no DOM. Tailwind 4 through `@tailwindcss/vite` and shadcn's components came in on 2026-09-21, on the same 0.1.24: `vp dlx shadcn@latest add <component>` writes into `src/components/ui/`. shadcn's registry now generates `import { cn } from "cn"`, an npm package that ships a binary named `cn`; it is not installed here, because in this repo `cn` is the CLI, and `src/lib/utils.ts` carries the helper over clsx and tailwind-merge instead. Recursive is self-hosted from `@fontsource-variable/recursive`. |

Three things pinned, and why:

- **vite-plus is pinned to the global `vp` binary's version**, 0.1.24 in the
  catalog. The `latest` tags mix a 0.3.x core with the 0.1.x test package that
  0.3.x no longer uses, and `vp check` then dies on "Cannot find native binding"
  before doing anything. Upgrade the global binary and the catalog together.
- **TypeScript 5.9, not 7.** vite-plus 0.1.x declares a peer range of 5 or 6,
  and Convex runs the installed `tsc`. Nothing in the tree needs 7.
- **Task caching off** (`run.cache: false`). To cache, the runner traces every
  file a task reads, and on WSL2 that tracer makes esbuild fail with
  `spawn EBUSY` and the type-aware linter with "Linting could not start", so
  `vp run verify` could not run its own check. The direct commands were fine
  throughout; only the nested ones broke. A verification has nothing worth
  caching anyway.

Lost by leaving eslint: the Convex eslint plugin's rules. Accepted; `vp check`
is what runs, and the rules are few.

---

## 12. Proposed, not decided

Called by the design session rather than chosen by Balder. Cheap to overrule:

- **Priority 0–4**, matching beads, because agents are already trained on it and
  `bd prime` is emphatic that it is not high/medium/low.
- **`dropped` requires a reason.** Closed-without-doing should never be silent.
- **Verification record** is `{ command, output, at, by }` or
  `{ unverified: reason }`. A command and its output, not prose — prose is what
  an agent fabricates.
- **Follow-up kinds**: `verify`, `decide`, `cleanup`.
- **Capability vocabulary** starts at `ios`, `android`, `web`, `device`,
  `decision`. A machine declares what it has as `can[]` in
  `~/.config/cairn/config.json`, overridden per call by `--can` or `CAIRN_CAN`.
- **No epic-to-epic edges.** Epics relate through their issues or not at all.

Added when the solution was mapped, 2026-09-17:

- **The actor `cn` sends** is `CAIRN_ACTOR` when set, else `<host>/<user>`, with
  `kind: agent` when `CLAUDECODE` is in the environment (Claude Code sets it for
  every shell it runs) and `human` otherwise. So a session on this machine is
  `wsl/claude` and Balder at a terminal is `wsl/balder`. Since 2026-09-22 it
  carries `session` beside the name when `CAIRN_SESSION` is set, which the
  SessionStart hook exports from the `session_id` Claude Code hands it. The
  name does not change with it, so the log and `--mine` keep one stable actor;
  every event carries the session, and events before that date carry none.
- **`cn close` runs the command.** The verification record is what the command
  did, captured by `cn`, with the last 40 lines of output and a 10-minute
  timeout. Proof that ran on another machine goes in as an `evidence` journal
  entry and the close is `--unverified` pointing at it.
- **Thresholds**: a claim silent 24 hours is shown as silent, an inbox item
  older than 7 days and a blocker past its nudge date are `cn review` findings,
  and an epic's "stuck" line is its open unclaimed issue silent longest, shown
  past 3 days. Revised 2026-09-22 from "released" and "raised" (§7). A claim
  with nothing journaled for an hour, counted from the later of the claim and
  its newest entry, is what the Stop hook hands back (§8, `JOURNAL_QUIET_MS`,
  added 2026-09-22).
- **Near-identical titles** are titles equal after lowercasing and replacing every
  run of non-alphanumerics with one space, or within Levenshtein distance 2 of
  each other after that (`NEAR_TITLE_DISTANCE`). Each raise carries a
  deterministic title and is asked once, resolved or not.
- **`ep-0` is the inbox**, created by the first `issues.create` that needs it.
- **The deployment config** grows two fields, both machine-local:
  `{ "default": "invyte", "can": ["web", "android"], "deployments": { "invyte": { "url": …, "secret": … } } }`.
- **The deployment secret.** One shared secret per deployment, `CAIRN_SECRET` in its
  environment, checked by `lib/guard.ts` on every public function and stripped from the
  arguments before the handler, so nothing downstream sees it. A deployment with none set
  checks nothing, which is what keeps the anonymous local one open. `cn` sends it from the
  deployment's `secret` in the config, or `CAIRN_SECRET` in the shell, which wins. It
  fences a deployment; it does not tell actors apart, which stays §13.
- **A verification record with `exitCode ≠ 0` cannot close an issue.** The
  choice is `--unverified` with a reason, or fix it.

---

## 13. Deferred

Not forgotten and not assumed. Each is to be settled against real usage during
implementation.

| Open question | Current lean |
|---|---|
| How a session resolves repo → project → deployment | Global config. A project is coarse, so path-derivation is out. The file and its shape are reserved: `CAIRN_URL`, then `~/.config/cairn/config.json` with named deployments and a default (`packages/cli/src/lib/config.mts`). `cn init` writes that file: checked before written, added and never replaced, mode 600 |
| Short ids for epics | Settled 2026-09-17: `ep-7`, one global counter, minted like issue ids; blockers likewise as `bl-3`. §3 |
| Local or cloud deployment for the throwaway window | Lean: the anonymous local deployment until `create` works, then one cloud deployment per company. Slice 8, `cn-8 "a cloud deployment per company, and the secret that guards it"` |
| Auth | Lean, slice 8: one shared secret per deployment, `CAIRN_SECRET` in the deployment's env and `secret` in the machine's config, checked by a `lib/guard.ts` wrapper on every public function and skipped when the deployment has none set, so the local anonymous one stays open. Identity auth, Convex Auth or Clerk, arrives with the page's first write, `cn-11 "apps/web, the human channel: ack and resolve behind identity auth"`, and only then does the actor stop being an argument. The read-only window before it sends the same shared secret `cn` does, pasted into the page and kept in that browser's localStorage, never in the bundle; the dev server alone also takes it from `CAIRN_SECRET`, so a developer's machine does not ask |
| Who counts as the actor on a journal entry or a claim | Lean: the argument `cn` sends (§12) until identity auth exists, then the token's identity, with `kind` from whether the token belongs to a person |
| Which project a session is in | Lean, from the global-config decision above: `--project` on `cn create`, and the repo's `CLAUDE.md` names its project so the skill can tell the agent. No `.cairn` file in a repo |
| The 136 issues in the Invyte beads graph | Nothing now; likely a partial import later |
| A push channel for human blockers | None. The UI becomes the channel |
| Running cairn for more than one person | Deliberately after it feels good to use alone. Open, as Balder put them on 2026-09-21: how a working agent is identified, how two machines of one person are told apart, how one person is told apart from a colleague, and how cairn is handed to somebody else at all. Whether a session needs an identifier of its own was answered 2026-09-22: it does, as `session` beside the actor's name (§5, §12), and that is the part of identity a claim depends on. The page's deployment picker waits on the same answers. Parked as `cn-28 "cairn for more than one person: who an agent is, which machine, which colleague, and how it is handed out"` in the inbox, to become an epic when planned; identity on the page itself is `cn-11` |

---

## 14. Explicitly not the path

**Writing a Convex storage backend for `bd` itself.** beads 1.3.0 does expose a
public backend package for out-of-tree backends, but it is marked EXPERIMENTAL
and asks you to implement `storage.DoltStorage`, a **144-method composed
interface**. The in-tree spike estimated 1.5–2.5k LOC for the adapter alone, and
there is no first-party Convex Go client. Ruled out 2026-09-15; the ruling
stands.

---

## 15. What beads actually is, measured

Measured 2026-09-15 against a shallow clone of `gastownhall/beads`, and
2026-09-16 against the full source tree at
`~/.claude/plugins/marketplaces/beads-marketplace` (HEAD `f56632a`, ahead of the
installed 1.2.2 binary) plus the live 136-issue database at
`~/code/invyte-hq/invyte/.bare/.beads/`.

```
production Go   348,385 lines
test Go         474,466 lines
                  2,848 files, 67 migrations, ~35 real tables
```

Almost none of that is the idea. Where the mass sits:

| Area | Lines | Wanted here |
|---|---|---|
| `cmd/bd`, 324 command files | 133,121 | No — pick your own surface |
| Dolt plumbing (`dolt`, `embeddeddolt`, `dbproxy`, `uow`, `versioncontrolops`) | ~38,000 | No — exists *only* because the store is a distributed VCS |
| `issueops` (CRUD + readiness) | 23,281 | Some of it |
| `httpapi` | 17,045 | No |
| Linear / ADO / GitLab / Notion / GitHub / Jira integrations | ~15,000 | No |
| `formula` (molecules, swarms, gates) | 5,252 | No |

### Structural findings that shaped this design

- **There is no epic entity.** An epic is `issue_type = 'epic'` plus
  `parent-child` dependency rows, and children get dotted ids
  (`invyte-lm5.4`) minted from a `child_counters` table that is **purely local
  to one database**. Two machines creating a child of the same parent between
  syncs both mint `parent.N`, and `child_counters` is not on the auto-resolve
  allowlist, so the pull aborts. That is the collision that happened here.
- **One fat `issues` row**, roughly 50 columns, of which ~20 are real product
  fields and ~30 are agent / molecule / gate / lease / compaction machinery.
- **Readiness is a denormalised boolean.** `bd ready` is
  `status='open' AND pinned=0 AND is_blocked=0` plus filters. `is_blocked` is
  maintained on write and repaired by `bd recompute-blocked` after every pull,
  because a merge can bring in another replica's dependency edge and leave the
  flag stale. `bd ready` trusts the flag, so a stale value silently hides ready
  work or surfaces blocked work.
- **19 dependency types, 4 of which affect readiness**: `blocks`,
  `conditional-blocks`, `parent-child` (inherited downward), `waits-for`.
- **Memories are `kv.memory.*` string rows in a `config` KV table** — no
  timestamps, no author, no tags. A memory stored as an empty string is
  indistinguishable from an absent one, which the source acknowledges.
- **Storage is embedded Dolt**, 69 MB on disk for 136 issues. The JSONL export
  is explicitly *"not the source of truth or a backup"* — it exists for viewers
  and interchange. Real sync is Dolt pull / merge / push over `refs/dolt/data`
  on an ordinary git remote.
- **Merge is last-write-wins per column**, because beads stamps `updated_at` on
  every mutation, so two edits to disjoint fields of the same issue still
  collide. The observed conflict rate is far above the semantic conflict rate,
  and any table off the auto-resolve allowlist aborts the whole merge.
- **`bd sync` does not exist in the installed 1.2.2 binary** (`unknown command`)
  though the shipped plugin documents it.

### Bugs to steal the fix for rather than rediscover

- **`--label-any` is silently dropped by `bd ready` on every backend.** A worker
  fencing itself to its own lane claims a bead from another lane and believes it
  is fenced. Directly responsible for the advisory-not-filtering choice in §5.
- **A dated defer never woke**, leaving one deployment with 241 beads dark, P1s
  included. Directly responsible for deferral being a date that still shows in
  counts, in §3.

---

## 16. Provenance

| | |
|---|---|
| Repo | `sandstrom99/cairn`, created 2026-09-17 with the skeleton |
| CLI binary | `cn`, two letters, like `bd` |
| Issue ids | `app-14`, `web-22` |
| npm | `cairn` is taken, as is every bare English word checked. A published CLI would be `@sandstrom99/cairn` |

**The name.** A cairn is the stack of stones a previous traveller leaves to mark
the route for whoever comes next. That is what task state outliving a session
actually is: not a database, a marker left for the next agent saying the way
goes here. It pairs with the `wayfinder` skill already on this machine —
**wayfinder charts the map, cairn holds the route.**

Named 2026-09-16. Rejected, and why:

- **quipu** — the truest metaphor available. The Inca knotted-cord device
  encoded structured, dependent records as knots on cords: literally a database
  made of string, and the real ancestor of "beads". Lost on being unfamiliar and
  awkward to type.
- **strand** — a strand of beads. States the lineage plainly, and a strand is a
  chain of dependent things, which is the part beads gets right. Too derivative.
- **ready** — named for the one query that matters. Unsearchable, and
  `ready close cn-14` reads badly.

**Design settled** over an interview on 2026-09-16 and 2026-09-17. The original
README made this conditional on the beads trial (`invyte-1ck`) ending in a no;
that condition is superseded by the decision to build it here and dogfood it on
its own construction before it goes anywhere near Invyte.
