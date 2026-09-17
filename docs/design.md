# cairn — design

An agent worklist on Convex. Task and project state that survives a session, is
shared by every agent and every machine, and has no sync layer because there is
nothing to sync.

Settled over an interview on 2026-09-16 and 2026-09-17, and revised the same
day when the surface question was reopened: one CLI and no MCP server (§10),
the reference form (§10), and the toolchain (§11). **The repository skeleton is
built; nothing domain-specific is.** Every decision below is a decision, not a
sketch; where something was deliberately left open it says so under *Deferred*,
with the lean recorded.

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
| Ids | Project-prefixed: `app-14`, `web-22`. Minted server-side inside a transaction. |
| Surface | One `cn` CLI over typed Convex calls. **No MCP server.** Revised 2026-09-17; the reasoning is in §10. |
| References | Every mention of an issue or epic carries id **and** title: `app-14 "fix connection retry"`. A bare id is a bug. §10. |
| Concurrency | Document revision on mutable fields. Journal entries and comments are inserts and never conflict. |
| Readiness | Three blocking edges: `blocks`, `blocked-by` (blocker entity), `defer-until`. Computed live. |
| Statuses | `open`, `in_progress`, `closed`, `dropped`. Blocked is derived, never stored. |
| Orphans | `epicId` is non-null. A per-project `inbox` epic is the escape hatch, and draining it is reconcile's standing job. |
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

```
projects    slug, name

epics       title, description, status, lastReconciledAt
            ↑ no projectId: an epic is an outcome, not a place

issues      projectId, epicId*, title, description, design, acceptance,
            type, followUpKind, parentIssueId,
            status, priority, claimedBy, claimedAt, lastActivity,
            deferUntil, requires[], verification, revision

blockers    kind, owner, title, whatResolves, nudgeAt, status, raisedBy

edges       from, to, type

journal     issueId, author, kind, body, createdAt      ← append-only, never updated

events      append-only audit of every mutation
```

`epicId` is required. There is no valid orphan state.

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
author and a timestamp, and every append stamps the issue's `lastActivity`.

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
without ever being confirmed.

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

- One blocker can block **many** issues.
- **Agents raise them. Agents may never resolve them.**
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

Scenario 1 answers without a tool call; scenario 2 starts warm.

> **The trap to avoid.** `bd prime` is exactly this, and it grew until it
> contradicted the skill shipped beside it: prime says *"Prohibited: Do NOT use
> TodoWrite"* while the plugin's own resources spend ~470 lines teaching when
> TodoWrite is the right tool. Prime wins, because it is a hook. **Rules belong
> in the skill, which loads on demand. The hook carries state, never doctrine.**

### Epic health

Not a percentage. A percentage hides everything that matters — an epic at 95%
frozen for a month reads better than one at 40% advancing daily.

```
Ship invite links                         last reconciled 3d ago
  12 done · 4 open · 3 follow-ups
  moving   app-31 (wsl/claude, 2h)
  stuck    web-12  open, unclaimed, silent 9d
  waiting  you — "confirm the invite copy"
```

Each line is a fact with a query behind it.

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
| **`cn` CLI** | Every agent, every hook, every cron, every jq pipeline. One verb is one Convex function call plus formatting: the CLI holds no logic. |
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
docs/                   this file, and the dogfood list
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
first ~10 issues live in a markdown file and are imported the day `create`
works. Everything after that is cairn issues in cairn.

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
| Local backend | `CONVEX_AGENT_MODE=anonymous npx convex dev` runs a local deployment with no Convex account, and is how `convex/_generated` was first produced. `convex codegen` alone refuses to run without a deployment. |
| CI | `voidzero-dev/setup-vp`, then the same commands. |

Two things pinned, and why:

- **vite-plus is pinned to the global `vp` binary's version**, 0.1.24 in the
  catalog. The `latest` tags mix a 0.3.x core with the 0.1.x test package that
  0.3.x no longer uses, and `vp check` then dies on "Cannot find native binding"
  before doing anything. Upgrade the global binary and the catalog together.
- **TypeScript 5.9, not 7.** vite-plus 0.1.x declares a peer range of 5 or 6,
  and Convex runs the installed `tsc`. Nothing in the tree needs 7.

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
  `decision`.
- **No epic-to-epic edges.** Epics relate through their issues or not at all.

---

## 13. Deferred

Not forgotten and not assumed. Each is to be settled against real usage during
implementation.

| Open question | Current lean |
|---|---|
| How a session resolves repo → project → deployment | Global config. A project is coarse, so path-derivation is out. The file and its shape are reserved: `CAIRN_URL`, then `~/.config/cairn/config.json` with named deployments and a default (`packages/cli/src/lib/config.mts`) |
| Short ids for epics | An epic is not project-scoped, so `app-` prefixes cannot apply. Lean: `ep-7`, one global counter, minted server-side like issue ids |
| Local or cloud deployment for the throwaway window | Lean: the anonymous local deployment until `create` works, then one cloud deployment per company |
| Auth, and who counts as the actor on a journal entry or a claim | Nothing decided |
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
