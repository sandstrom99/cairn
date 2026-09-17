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
| Orphans | `epicId` is non-null. One inbox epic per deployment, `ep-0 "Inbox"`, is the escape hatch, and draining it is reconcile's standing job. Revised 2026-09-17 from one inbox per project: an epic has no project, and `cn list --epic ep-0 --project app` is the per-project view for free. |
| Done | Closing takes a verification record: what was run and what it said, or `unverified` with a reason. |
| Residue | A `follow-up` issue with `requires[]`, linked to its parent, counted **outside** the epic denominator. |
| Fencing | Advisory in `ready` (returned and marked), filtered in the situation report. |
| Claiming | Atomic claim, no lease. `lastActivity` is stamped by every journal append. Reconcile auto-releases a silent claim. |
| Blockers | Own table, own lifecycle. Agents raise them and may never resolve them. |
| Blocker channel | Pull-only: on request, and in-session when an agent hits one. The UI becomes the channel later. |
| Reconcile | Acts alone on checkable facts. Judgement becomes a human blocker addressed to Balder. |
| Session start | A hook injects under 20 lines: counts plus the top of each queue. |
| Epic view | A health line — moving, stuck, waiting on you, last reconciled. Not a percentage. |
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
              droppedReason?    string
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
                    by_status [status, priority], by_activity [status, lastActivity],
                    by_parent [parentIssueId]

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
              index by_public_id [id], by_status [status, nudgeAt]

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

**Claim.** Atomic, first writer wins, idempotent for the same actor. Sets
`status = in_progress` and `claimedBy`. **No lease and no TTL** — a lease
forecloses the cooperative behaviour that is the whole point. `lastActivity` is
stamped by every journal append, so heartbeat costs the agent nothing, and
reconcile auto-releases a claim that has been silent past a threshold.

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

The answer to clutter. Three mechanisms, in this order of arrival:

1. **Write-time invariants**, so the bad state cannot be represented at all:
   `epicId` non-null, close requires a verification record, `dropped` requires a
   reason.
2. **A reconcile skill**, triggered by hand per epic (`cn reconcile <epic>`).
3. **A scheduled sweep**, once the skill has earned the trust.

### What it may do alone

The rule from the interview: *facts yes, judgement asks.*

| Condition | Action |
|---|---|
| Issue in `inbox`, exactly one epic matches | reparent it |
| Epic with every child closed and no open follow-ups | close it |
| Claim with no journal activity past N hours | release it |
| Closed `unverified` with no follow-up spawned | spawn one |
| `blocks` edge pointing at a closed issue | drop the edge |
| Two open issues, same epic, near-identical title | **raise to Balder** |
| Inbox item older than N days | **raise to Balder** |
| Blocker past its `nudgeAt` | **raise to Balder** — *"still waiting on App Store review?"* |

A raise is a human blocker, so reconcile's questions arrive through the same
mechanism as everything else waiting on a person.

Reconcile is one mutation, `reconcile.run(epicId, owner)`, so what it did and
what it raised come back as one answer, and running it twice acts on nothing the
second time. Every raise is addressed to `owner`, which `cn reconcile --owner`
names and `CAIRN_OWNER` supplies when it does not. "Exactly one epic matches"
is a fact test, not a guess: the inbox issue's parent or `discovered-from` issue
sits in exactly one open epic. The sweep is `reconcile.sweep`, an internal
function on a cron in `crons.ts`, running the same rules over every open epic
plus the `nudgeAt` raise, once per `nudgeAt`. The thresholds are constants in
`lib/thresholds.ts`, proposed in §12, where epic health reads the same numbers.

**There is no `bd triage`.** beads' hygiene surface is `bd stale`, `bd orphans`,
`bd lint`, `bd preflight` and `bd human` — and `bd orphans` finds *broken
dependency edges*, not epic-less issues. The thing that actually goes wrong has
no command at all.

---

## 8. The two human-facing views

### Session start

A hook injects **under 20 lines**:

- ready count, and the top 3 by priority
- in progress, with actor and age
- follow-ups this session's capabilities can finish
- waiting-on-you as a **count only**
- anything reconcile flagged

Scenario 1 answers without a tool call; scenario 2 starts warm. One query,
`brief.get(can)`, returns the numbers and the heads; `cn brief` lays them out:

```
cairn · invyte · wsl/claude can web android
ready 7        app-31 "retry on reconnect" P1 · web-12 "invite landing copy" P1 · app-40 "…" P2
in progress    app-14 "fix connection retry" wsl/claude 2h · web-9 "…" mac/claude 1d
follow-ups     app-22 "[verify] confirm retry path on a device" (web)
waiting on you 3
flagged        2 inbox items older than 7d
```

> **The trap to avoid.** `bd prime` is exactly this, and it grew until it
> contradicted the skill shipped beside it: prime says *"Prohibited: Do NOT use
> TodoWrite"* while the plugin's own resources spend ~470 lines teaching when
> TodoWrite is the right tool. Prime wins, because it is a hook. **Rules belong
> in the skill, which loads on demand. The hook carries state, never doctrine.**

### Epic health

Not a percentage. A percentage hides everything that matters — an epic at 95%
frozen for a month reads better than one at 40% advancing daily.

```
ep-3 "Ship invite links"  12 done · 4 open · 3 follow-ups · last reconciled 3d ago
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
| **Claude Code plugin** | Skill, SessionStart hook, slash commands. Ships from `plugins/cairn` in this repo so it versions with the code and installs anywhere, including cloud runners. |
| **`apps/web`** | Reserved. Built once the schema stops moving. |

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
 │ SessionStart hook  ──  cn brief    │              │ schema.ts     the tables of §3     │
 │ SKILL.md           teaches the verbs│              │ issues.ts  epics.ts  journal.ts    │
 │ /cairn:* commands  ──  cn …        │  ── HTTPS ─► │ edges.ts  blockers.ts  ready.ts    │
 │ the agent          ──  cn <verb>   │  one typed   │ show.ts  brief.ts  reconcile.ts    │
 └────────────────────────────────────┘  call per    │ projects.ts  crons.ts              │
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
- **The deployment is where anything decides.** `ready` computes, `close`
  validates, `reconcile` acts, `create` hands back candidate epics. `cn` parses
  arguments, runs the one command `cn close` proves with, and formats through
  `ref()`.
- **The scheduled sweep runs inside the deployment**, an internal function on a
  cron. There is no daemon on any machine.
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
apps/                   reserved, in the workspace globs, nothing in it
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

Order of magnitude: **2–5k lines**.

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
| Local backend | `CONVEX_AGENT_MODE=anonymous npx convex dev` runs a local deployment with no Convex account, and is how `convex/_generated` was first produced. `convex codegen` alone refuses to run without a deployment. |
| CI | `voidzero-dev/setup-vp`, then the same commands. |

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
  `wsl/claude` and Balder at a terminal is `wsl/balder`.
- **`cn close` runs the command.** The verification record is what the command
  did, captured by `cn`, with the last 40 lines of output and a 10-minute
  timeout. Proof that ran on another machine goes in as an `evidence` journal
  entry and the close is `--unverified` pointing at it.
- **Reconcile thresholds**: a claim silent 24 hours is released, an inbox item
  older than 7 days is raised, an epic's "stuck" line is its open unclaimed
  issue silent longest, shown past 3 days.
- **Near-identical titles** are titles equal after lowercasing and replacing every
  run of non-alphanumerics with one space, or within Levenshtein distance 2 of
  each other after that (`NEAR_TITLE_DISTANCE`). Each raise carries a
  deterministic title and is asked once, resolved or not.
- **`ep-0` is the inbox**, created by the first `issues.create` that needs it.
- **The deployment config** grows two fields, both machine-local:
  `{ "default": "invyte", "can": ["web", "android"], "deployments": { "invyte": { "url": …, "secret": … } } }`.
- **A verification record with `exitCode ≠ 0` cannot close an issue.** The
  choice is `--unverified` with a reason, or fix it.

---

## 13. Deferred

Not forgotten and not assumed. Each is to be settled against real usage during
implementation.

| Open question | Current lean |
|---|---|
| How a session resolves repo → project → deployment | Global config. A project is coarse, so path-derivation is out. The file and its shape are reserved: `CAIRN_URL`, then `~/.config/cairn/config.json` with named deployments and a default (`packages/cli/src/lib/config.mts`) |
| Short ids for epics | Settled 2026-09-17: `ep-7`, one global counter, minted like issue ids; blockers likewise as `bl-3`. §3 |
| Local or cloud deployment for the throwaway window | Lean: the anonymous local deployment until `create` works, then one cloud deployment per company. Slice 8, `cn-8 "a cloud deployment per company, and the secret that guards it"` |
| Auth | Lean, slice 8: one shared secret per deployment, `CAIRN_SECRET` in the deployment's env and `secret` in the machine's config, checked by a `lib/guard.ts` wrapper on every public function and skipped when the deployment has none set, so the local anonymous one stays open. Identity auth, Convex Auth or Clerk, arrives with `apps/web`, and only then does the actor stop being an argument |
| Who counts as the actor on a journal entry or a claim | Lean: the argument `cn` sends (§12) until identity auth exists, then the token's identity, with `kind` from whether the token belongs to a person |
| Which project a session is in | Lean, from the global-config decision above: `--project` on `cn create`, and the repo's `CLAUDE.md` names its project so the skill can tell the agent. No `.cairn` file in a repo |
| The 136 issues in the Invyte beads graph | Nothing now; likely a partial import later |
| A push channel for human blockers | None. The UI becomes the channel |

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
