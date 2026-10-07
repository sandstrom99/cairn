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
| Actor | `{ name, kind: human \| agent }`, stored inline on every claim, journal entry, edge, blocker and event. `cn` supplies it as an argument, with `kind` set from whether Claude Code is the caller, and nothing checks it: cairn runs on trust, and the host in the name carries the person's (§12, §13, 2026-09-29). |
| Surface | One `cn` CLI over typed Convex calls. **No MCP server.** Revised 2026-09-17; the reasoning is in §10. |
| References | Every mention of an issue or epic carries id **and** title: `app-14 "fix connection retry"`. A bare id is a bug. §10. |
| Concurrency | Document revision on mutable fields. Journal entries and comments are inserts and never conflict. |
| Readiness | Three blocking edges: `blocks`, `blocked-by` (blocker entity), `defer-until`. Computed live. |
| Statuses | `open`, `in_progress`, `closed`, `dropped`. Blocked is derived, never stored. |
| Orphans | `epicId` is non-null. One inbox epic per deployment, `ep-0 "Inbox"`, is the escape hatch, and draining it is the first thing a review sitting looks at (§7). Revised 2026-09-17 from one inbox per project: an epic has no project, and `cn list --epic ep-0 --project app` is the per-project view for free. |
| Done | Closing takes a verification record: what was run and what it said, or `unverified` with a reason. |
| Residue | A `follow-up` issue linked to its parent, counted **outside** the epic denominator. |
| Fencing | Advisory in `ready` (returned and marked), filtered in the situation report. |
| Claiming | Atomic claim, no lease, idempotent per session: the actor's name and the Claude Code session it runs in, together (§5, 2026-09-22). `lastActivity` is stamped by every journal append. A silent claim is shown as silent and released on a person's word, by them or by an agent; nothing releases one alone (§7, revised 2026-09-22). Anybody may release, close or drop a claim another holds; leaving it alone is guidance, not a refusal (§5, 2026-09-29). |
| Blockers | Own table, own lifecycle. Agents raise them, and end them only on the person's word, which the record quotes (cn-87). |
| Blocker channel | Pull-only: on request, and in-session when an agent hits one. The person answers in the session, and the agent ends it on their word. |
| Reconcile | Revised 2026-09-22: no automatic run. Facts are checked in the verb that makes or reads them; judgement is a sitting, `cn review`, a person and an agent going through one epic. §7. |
| Session start | A hook injects under 20 lines: which projects there are, counts plus the top of each queue. |
| Epic view | A health line — moving, stuck, waiting on you. Not a percentage. |
| Wiring | cairn ships its own Claude Code plugin, from `plugins/cairn` in this repo. |
| Code hosts | None. A pull request, a commit, an artifact or a doc is a link on the issue (§3 "Links"); cairn reads nothing from and writes nothing to a code host, GitHub Issues included. |
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
projects      slug              string        the id prefix: app, web, cn. ep and bl are reserved. Never changes
              name              string        its one-line summary
              description?      string        what does not belong, which repository the work lands in
              links?            { url, label?, by, at }[]   a repository is a link, never a field
              revision?         number        absent on a project from before cn-125, which reads as 0
              index by_slug [slug]

counters      key               string        "ep", "bl", or a project slug
              next              number        the next number to mint
              index by_key [key]

epics         id                string        ep-7. ep-0 is the one inbox
              title             string
              description?      string
              links?            { url, label?, by, at }[]   http and https only
              status            open | closed | dropped
              droppedReason?    string        the epic view returns it, like an issue's
              revision          number
              index by_public_id [id], by_status [status]
              ↑ no projectId: an epic is an outcome, not a place

issues        id                string        app-14
              projectId         Id<projects>
              epicId            Id<epics>     required, always
              title             string
              description?      string        these three live in issueText; a row from before
              design?           string          2026-09-30 carries them until issueText:move
              acceptance?       string
              type              task | follow-up
              followUpKind?     verify | decide | cleanup       required iff type = follow-up
              parentIssueId?    Id<issues>    the issue whose residue this is
              links?            { url, label?, by, at }[]   http and https only
              status            open | in_progress | closed | dropped
              priority          number        0 is highest, 4 is backlog
              claimedBy?        actor
              claimedAt?        number
              lastActivity      number        stamped by claim, update, close and every journal append
              deferUntil?       number
              verification?     { command, exitCode, output?, at, by } | { unverified, at, by }   output as above
              droppedReason?    string
              closedAt?         number
              revision          number
              index by_public_id [id], by_epic [epicId, status], by_project [projectId, status],
                    by_status [status, priority], by_parent [parentIssueId]

issueText     issueId           Id<issues>    one row per issue: its long text, apart from the row every list reads
              description?      string
              design?           string        HOW; may change during implementation
              acceptance?       string        WHAT; stable across sessions
              output?           string        the proof's output; the rest of the record stays on the issue
              index by_issue [issueId]
              searchIndex search_description [description]

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
              links?            { url, label?, by, at }[]   http and https only
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
              searchIndex search_body [body]

events        kind              string        issue.create, issue.claim, edge.add, blocker.resolve, …
              actor             actor
              issueId?          Id<issues>
              epicId?           Id<epics>
              blockerId?        Id<blockers>
              projectId?        Id<projects>
              revision?         number        the revision the target moved to
              changes           any           field → { from, to }, or the payload of the action
              index by_issue [issueId, revision], by_epic [epicId], by_blocker [blockerId],
                    by_project [projectId]

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
it, what it waits on, its parent and its follow-ups. Every issue it names that is
finished carries `done` or `dropped` after its reference, so a finished follow-up,
parent or edge end never reads as live work (§7).

### Revision and events

Every mutable write to an issue, epic, blocker or project carries the `revision`
the writer read, bumps it by one, and writes an `events` row carrying the new
revision and what changed. A journal append is an insert: it stamps
`lastActivity` and writes an event, but neither takes nor bumps `revision`. A
stale write is rejected with the events since the writer's revision, which is
exactly the "what changed, who changed it and when" of §9, read from the table
rather than reconstructed. A project from before cn-125 was stored with no revision
and reads as revision 0, so nothing migrates it; its first update stores 1.

What an event records is what a reader should see, not the patch that was written.
`lastActivity`, `claimedAt` and `closedAt` are housekeeping the row's own time already
says, and an actor travels by name. So a claim records `status` and `claimedBy`, a release
the same in reverse, a close `status` and a one-line summary of the verification whose
whole record stays on the issue, and a drop `status` and `droppedReason`; the helpers are
in `lib/lifecycle.ts`, one per move, each owning the patch it writes and what its event
records, shared by every site that makes that move. Events written before 2026-09-20
carry the raw patch for those four kinds, because nothing migrates an audit trail, so
whatever renders `changes` reads both. No string in `changes` runs past one line of 80
characters: `record()` in `lib/events.ts` cuts every string, at any depth, to its first
line, with `…` where more followed, so a description, a design, an acceptance list or a
resolution's note travels in an event as its first line and stays whole only on the row,
and the cut `journal.append` made of its own body moved there. Events written before
2026-09-30 carry whole copies, a create's of every text field and an update's of both
sides, which nothing migrates either; every reader already printed one line per field, so
nothing shown changed.

Whatever renders `changes` renders every kind as a line and none as JSON, settled
2026-09-22 in `eventPieces` (`parts.mts`), which `cn log`, `cn show --history`, a stale
write's retry lines and the web window's feed and history all go through. A field map is
its fields, `status open → in_progress`; a journal append its kind and first line; an
edge, a blocker's raise and an attach read relative to the id whose line it is, the way
§7 reads an edge from either end, `blocked by cn-1`, `waits on bl-3`, `holds cn-18`; the
resolve recorded on each issue a blocker held is the blocker and the note. A create has no
payload, since the reference leading its line already names what was created, except a
project, which has no reference to lead with and prints as its slug and name. A project's
update leads with nothing either, and names the project at the start of its changes, as
the resolve an issue was freed by names its blocker. A raw patch
from before 2026-09-20, a blocker's own resolve among them, reads as the changes the same
move records today: the housekeeping and the actor today's event leaves out are dropped,
an actor prints by name and a verification record as its summary, so an old close and a
new one print the same line. A `reconcile.run`, from before the sitting of §7 replaced
the verb, reads as what it did and who asked, `did 5 · raised 0 · by balder/balder`.

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

The three fields, an epic's description and every journal body are **Markdown**:
CommonMark with GitHub's tables, task lists, strikethrough and bare links. cn prints
the source, which reads as text in a terminal, and cuts a field to its first line,
so the first line is a plain sentence that stands alone; a heading's `#`s are dropped
from a cut line. The page sets it (§8). Settled 2026-09-26 on cn-77, after the page's
reader of three habits (paragraphs, `- ` lists, backticks) turned the numbered lists
agents write into one run of text. `cn` reads any of them from stdin as `@-` or from a
file as `@path`, so a multi-line body never passes through shell quoting, and refuses
one over 64 KiB.

**What beads calls `notes` is deliberately absent.** Its own docs define it as
*"current state, not cumulative"*, so it is rewritten on every handoff. That is
how a "tested on device" update disappears, and `--append-notes` dropped 3 of 16
writes on top of it. The journal replaces it and cannot lose an entry, because
an append is an insert.

**From 2026-09-30 the three fields and the proof's output live in `issueText`**, one
row per issue, beside the issue rather than on it. Convex bills a read for the whole
document, and every list read the text to print one line: on `cairn` that day the text
was 85% of an issue row's bytes, and 114 of its 136 issues were closed ones every list
read anyway. `show.get` and `search.find` read the text, the mutations that set it
write it there, and `issueText:move` moved the rows written before; until it has run
on a deployment, the readers fall back to the row's own fields. `cn list --json` and `cn ready --json` no longer
carry the three fields, which only `cn show` ever printed.

**`search.find` reads descriptions and journal bodies through text indexes**, not by
reading every row. A scan read every description and the whole journal on each call,
0.7 to 0.9 MB a call on deployments of 130 to 160 issues measured 2026-10-04, and an
agent searches before every create. The index is asked for the text's longest word
alone, as a prefix, and `search.find` then holds each row it finds to every word, each
found from its start: asked for every word, the index answered for any of them, and a
common one read half the journal, 744 KB for a text nothing held. Titles and links stay one substring rule over the issue rows the call reads
anyway, so the page's jump bar agrees on a title.

### Journal entry kinds

`finding`, `decision`, `handoff`, `evidence`, `question`, `next`. Every entry carries an
author and a timestamp, and every append stamps the issue's `lastActivity`. Where
§9 says "comments", it means these: there is no second table. `next` is the one kind
with a status: it is the direction a finished issue leaves (§4, Close), and a live issue
refuses it, since where a live one stands is a `handoff`.

### Links

Issues, epics, blockers and projects carry links. On an issue they point at what its work left
behind: a pull request, a commit, a Claude artifact, a doc, a screenshot, a dashboard. A
link is a URL, an optional label, who added it and when.

It is a field of the thing, the same on all four. `--link` on `cn create`, `cn epic new`,
`cn wait` and `cn project new` sets it, and `--link` and `--unlink` on `cn update` and
`cn project update` change it, against the revision like any edit. A URL already there
takes the new label, and a bare one leaves it as it is, so linking twice is harmless.
Only http and https are accepted, because the page renders a link as an anchor. It
prints as its label, then its URL, then who added it and when:

    doc · https://example.com/doc · by balder/claude 2h ago

An epic's links are where its plan doc goes. A decision blocker's are where the artifact
laying out its options goes, since the blocker is what a person is asked to resolve. A
project's are where its repository goes: a repository is a link, a URL cairn never reads,
and never a field.

cairn knows no code host. A pull request is a link like any other: nothing reads its
state, nothing tells a merged one from an open one, and nothing counts toward readiness,
because the issue's own state says the work landed. cairn reads nothing from and writes
nothing to a code host, GitHub Issues included; a project that uses them does so beside
cairn. What gets linked, and when, is for the rules a person works under, not for cairn,
which tells nobody how to version control. The way back from a pull request is the
reference form in its body, which those rules write.

Decided 2026-09-27 on
`cn-74 "decide how cairn and git meet: what an issue records of the code work, who writes it, and what stays out"`.
Considered and not taken:

- A plugin hook on `gh pr create` that attaches the URL by itself. It works, and it
  builds git into the task system.
- A CI step or a webhook turning pull request events into cairn events, which needs a
  secret in every repository or credentials on the deployment, and favours one host.
- A table of git work with host, repository and number, when a link is one shape and the
  URL already says all of it.
- Links as a journal kind, where a wrong one could never come off.
- Printing a known host's URL short, which would be the first host knowledge in cairn.

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
ready =
    status = 'open'
    AND no open `blocks` edge into it
    AND no unresolved blocker attached
    AND (deferUntil is null OR deferUntil <= now)
  ordered by priority, then age
```

Computed live. **No `isReady` column, no `recompute` command.** beads spends
roughly 2,000 lines here, of which about 800 exist only to repair a
denormalised flag after a three-way merge — a category that does not exist on a
single authoritative deployment.

In Convex terms it is one query function, `ready.list`: the candidates through
`by_status [open]`, every `blocks` edge into them through `by_to` with the
blocking issue's status, every `blockerLinks` row through `by_issue` with the
blocker's status, then the date test and the sort. Every read is an index
lookup, and at the sizes here (the first company's beads graph is 136 issues) the whole
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
`cn review`, and it is released on a person's word, by them or by an agent they ask:
nothing releases a claim on its own (§7).

"The same session" is the actor's name and its `session` together (§12). Every
Claude session on a machine is the same `wsl/claude`, so on the name alone two
parallel sessions both won one claim and, after compaction, nothing could say
which claim was this session's. A second session of the same name is refused
like any other claimant, told it is held `in another session`; a shell with no
session is not the session that holds it either.

**Release, close and drop refuse nobody.** Anybody may release, close or drop an
issue another name has claimed, a person or an agent; the event records whose claim
it was and who ended it. Until 2026-09-29 an agent was refused on a claim held under
another name, and that fence protected nothing on a deployment run on trust (§13).
It stranded a session whose machine was renamed under it, which then acted under the
new name and could not close its own work, and it refused an agent a person had asked
to free a silent claim, when the person never runs a command themselves (cn-122).
Leaving another's claim alone is now the skill's guidance: touch it only when the
person asks, or when it is plainly this work's own claim under an old name, and
journal why first. Claim itself still refuses a held issue, since two agents racing
for one need one winner; a deliberate takeover is a release, then a claim.

**Close.** Takes a verification record. In beads, close is a free-text
`close_reason` that nothing checks, which is exactly how work gets marked done
without ever being confirmed. Here `cn close --run '<command>'` runs the command
itself and records the command, its exit status and the tail of its output; the
agent never types the output in, so there is nothing to fabricate. `issues.close`
refuses a non-zero exit unless the close is `--unverified` with a reason. A
follow-up given on the same close is created in the same mutation, so a parent
never closes without its residue existing. The answer also carries the open issues
this close was the last thing holding, each as a ready row, and `cn close` prints
them under the closed issue so an agent's loop continues without a second
`cn ready`. Nothing is stored for it: the edge stays, and reads `done` (§7).

**The direction a close leaves.** Added 2026-10-05 (cn-159). The session that just
finished a piece of work has the strongest opinion on where that branch of work goes
next, and it is gone a moment later. `cn close --next "<direction>"` keeps it: free text,
optional, naming issues or none, written in the close's own mutation as a `next` journal
entry on the closed issue; `cn journal <id> --kind next` adds one thought of afterwards.
It is read where the next reader already looks, and nowhere else is it stored: `cn show`
prints the newest one's first line on the issue itself, on each issue it blocked, on its
follow-ups, and on the epic, which names the three newest among its finished issues.
The brief carries none, since nothing says when a direction has been taken and a line
there would go stale. It is an opinion and never an edge: readiness, order and priority
do not move for it. Work it names that no issue holds is a follow-up.

This replaced the `next-session` skill and setting of the day before (cn-153, cn-154),
under which a closing session wrote the next session's opening prompt, the person's own
rules repeated in it, and ended its reply with it or with an offer to. That was cairn
running a person's sessions: what a prompt says, how many issues a session takes and how
a reply ends are a way of working, and a way of working is theirs. cairn is what such a
way of working is built on, so it keeps the one thing only the worklist can keep, the
direction, and a person's own skill or loop turns that into whatever opens their next
session. It is on the close and not on a hook because the close is the moment the work
is finished whatever harness runs `cn`: Claude Code's Stop fires at every turn and
cannot tell, and its SessionEnd fires when nothing is left to write with.

**Edit an epic.** An epic's title, description and links are edited with
`cn update ep-N` against its revision, as an issue's are, while it is open; ep-0,
the inbox, is not.

### Follow-ups: residue that must not hang

The problem, in Balder's own two cases:

- A change verified on Android and web, but this machine is WSL and cannot run
  iOS. Very likely fine. It should reach **the next session that can run iOS**.
- A decision that surfaced mid-implementation and might change direction. Merge
  now, revisit later. Not blocking, but it must not evaporate.

Both are the same shape, and it is **routing, not blocking**. The iOS check is
not waiting on a dependency; it is waiting on a session that has an iOS device.
Its title says so, every session sees it on the brief's follow-ups line, and the
one with a device picks it up: cairn fences nothing by machine (§5).

```
app-14  fix connection retry          closed ✓
        verified: android, web
        residue → app-22

app-22  [follow-up · verify]          open
        parent:   app-14
        verify: the retry path on an iPhone

epic:  12 done · 3 follow-ups open
       (follow-ups are not in the denominator)
```

- `type: follow-up`, with `followUpKind` of `verify`, `decide` or `cleanup`.
- `parentIssueId` links back to what produced it.
- What finishing it needs, a phone or one machine, is in its title or description.
- **Counted outside the epic denominator**, so "12 done" keeps meaning what it
  says.
- The parent closes. Nothing hangs half-finished.
- A follow-up lands beside its parent, in whatever epic that is. Residue outlives a
  close and an epic closes over open follow-ups, so the open-epic rule is for the epic
  an argument names, not for routing.

### No capability fencing

Nothing in cairn knows what a machine or a session can do. Work only a phone, a
device or one particular host can finish says so in its own title or description,
and the session reading `cn ready` decides whether it is one of those. A decision
only a person can make is a human blocker (§6), which counts in "waiting on you".

Until 2026-09-29 a machine declared `can[]` in its config, from `ios`, `android`,
`web`, `device` and `decision`, and `ready` marked a row it could not satisfy
`· needs ios`. It went on Balder's word, in cn-116: the vocabulary was one company's,
an app shop's, and a tracker meant for anyone's work has no business with it. Of 117
issues on cairn's own worklist, one had ever required a device. `decision` had put
decisions in ready, marked, while the brief read `waiting on you 0` with two waiting
on him. The same day, cn-101 had settled the host case: cairn stays host
agnostic, so a machine fence is text on the issue.

> beads fences work, and it is broken: **`--label-any` is silently dropped by
> `bd ready` on every backend**, so a worker fencing itself to one lane claims
> from another and believes it is fenced. With no fence, nothing can fail open.

`requires[]` went from issues the same day: cn-119 stopped writing and reading it, a
one-off stripped it from `cairn` and `invyte`, and cn-120 dropped it from the schema, for
every deployment and not only those two (Balder, "nuke the field for strangers too"). A
deployment that ran cairn from before `b673ae2` still stores it, and Convex refuses a
schema without the field over rows that have it; `docs/install.md`'s "Updating" says the one
push through `b673ae2` that clears it.

---

## 6. Human blockers

Their own table, their own lifecycle. Not a status, not an issue type, not an
edge property.

```
blockers    kind          approval | external-wait | decision | credential | purchase
            owner         who must act
            title         what is being waited on
            whatResolves  what would end it
            links         optional; where a decision's options are laid out (§3, "Links")
            nudgeAt       optional date
            status        raised → waiting → resolved
            raisedBy      which agent raised it
```

- One blocker can block **many** issues, through `blockerLinks`. `cn wait <issue>`
  raises a new one, `bl-3 "App Store review"`, or attaches an existing one with
  `--on bl-3`; both are `blockers.raise`.
- A blocker's title, what resolves it and its links are edited with
  `cn update bl-N` against its revision, while kind and owner stay as raised:
  changing who a blocker waits on was left out when running cairn for more than one
  person was settled on trust (§13).
- **Agents raise them, and end them only on the person's word.** `blockers.ack` and
  `blockers.resolve` refuse an actor of kind `agent` that does not carry `said`, the
  person's words verbatim, and the events, `cn show` and `cn log` quote them. The person
  speaks plain language to their agent and never runs a command (§8), so an agent is how
  a wait on them ends, and the quote is what keeps that honest. It is a guardrail against
  an honest agent, not a lock against a lying one, and on trust that is enough (§13).
  Changed 2026-09-28 (cn-87), when cn-11, the page acking and resolving behind identity
  auth, was dropped.
- They do not appear in any agent work queue, and they are not counted in epic
  progress — otherwise "7 of 10" starts counting work no agent can do.

**Channel: pull-only.** On request (`cn waiting`), and in-session when an agent
hits one. No push, no email, no GitHub mirror. The session is the channel: the
person answers there, and that is the accepted cost: a blocker raised Friday is not
seen until the next session.

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
| Issue in the inbox, exactly one epic matches: reparent it | At `cn create`: an issue bound for the inbox with a `--parent` in an open epic goes beside the parent, and the answer says so. A `discovered-from` edge is added after the create, so it does not place; `cn review ep-0` lists what sits there past 7 days |
| Claim with no activity past 24 hours: release it | The brief and `cn review` show it as silent. It is released on a person's word. **Nothing releases a claim on its own** |
| Two open issues, same epic, near-identical title: raise | `cn create` hands the matches back before the duplicate exists, and `cn review` lists any that got through |
| Inbox item older than 7 days: raise | A `cn review` line |
| Blocker past its `nudgeAt`: raise | A `cn review` line |

### What the sitting reads

`review.get(epicId)` is one query, and every line it returns is in the reference
form, with what to do about it left to the two reading it: near-identical
titles, inbox items past 7 days, blockers past their nudge date, claims silent
past 24 hours, closes marked unverified with no follow-up beside them, `blocks`
edges with one end finished and the other still live (an edge whose two ends are
both finished is history with nothing left to decide, so it is no line), and
whether every issue is finished so the epic can close. Running it twice reads
the same; nothing it prints is consumed by printing it. The thresholds are the
constants of §12.

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
last issue of the backend refactor epic. It landed on 2026-09-22. The one field
the sweep wrote, `epics.lastReconciledAt`, outlived it by a day: a schema that
forbids a field will not push over rows that carry it, and `ep-1` and `ep-6` on
the worklist did. `cn-62 "drop lastReconciledAt from the epics schema once ep-1
and ep-6 are patched"` patched the two rows with a one-off internal mutation, run
once and deleted, and took the field out of the schema on 2026-09-23.

**There is no `bd triage`.** beads' hygiene surface is `bd stale`, `bd orphans`,
`bd lint`, `bd preflight` and `bd human` — and `bd orphans` finds *broken
dependency edges*, not epic-less issues. The thing that actually goes wrong has
no command at all.

---

## 8. The two human-facing views

### Session start

A hook injects **under 20 lines**:

- the projects the deployment has, as their slugs
- ready count, and the top 3 by priority, carrying what `cn ready`'s line prints; the page asks for five
- in progress, with actor and age, marked `yours` where the claim is this session's
- the open follow-ups
- waiting-on-you as a **count only**
- a claim silent past the threshold, marked `silent 26h`
- the settings this machine has set (§12), each name with its state, on a last line
  that is not there when every one is off

Scenario 1 answers without a tool call; scenario 2 starts warm. With `cn` on
PATH and no deployment configured the hook prints two lines pointing at
`/cairn:init` instead of nothing, because a machine that has `cn` installed
means to use it. With one configured that does not answer, or refuses the
secret, it prints one line, `cairn: <name> did not answer; cn doctor says why`,
settled 2026-09-22: until then the hook swallowed every failure, so a dead URL
or a wrong secret started a session exactly like a machine with nothing
installed, and the skill taught only two states. The hook never diagnoses; `cn
doctor` does, and the line names it. With a config that does not resolve at all,
such as a `CAIRN_DEPLOYMENT` this machine has not set up, it prints `cairn: <cn's
one line>`, the line `cn` itself fails with, since no deployment was reached to
not answer (2026-09-29). The hook's 5 s timeout in the manifest is
what bounds a URL that never answers at all. One query, `brief.get`,
returns the numbers and the heads; `cn brief` lays them out:

```
cairn · acme · wsl/claude
projects       app · web
ready 7        app-31 "retry on reconnect" P1 · web-12 "invite landing copy" P1 · app-40 "…" P2
in progress    app-14 "fix connection retry" wsl/claude 2h · yours · web-9 "…" mac/claude 3d · silent 26h
follow-ups     app-22 "confirm retry path on a device" [verify]
waiting on you 3
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
threshold in §12, a Stop hook hands it back `cn brief --unjournaled`, which
calls `brief.unjournaled` and reads this session's in-progress rows alone
(2026-09-30):

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

Each line is a fact with a read behind it, `epicHealth` in `lib/health.ts`,
which `epics.list` and `show.get` carry, and a line with nothing behind it is
not printed: a fresh epic is its first line alone. `done` and `open` count
tasks, follow-ups sit beside them (§5), `moving` is every claim with who and
since when, `stuck` is every open, unclaimed issue silent past its priority's
limit in §12, most urgent first and silent longest within a priority, the first
three by name and the rest counted, `and 2 more stuck`, and `waiting` is every
unresolved blocker on the epic's live issues. An issue a blocker holds is
waiting, never stuck as well.

### Project health

Epics cut across projects, so an epic's health cannot say whether anything in
`admin` has stopped moving. A project has the same three lines over its own
issues, from the same `issueHealth` in `lib/health.ts`, and `cn project list`
prints a block per project in the epic's shape; a project nothing has been filed
under is its head alone, `admin "Invyte admin, the admin app"  nothing filed`.
Beside them the page draws the project's pulse, which the text lines do not
print. `projects.list` carries it for a caller that sends `pulse: true`,
`cn project list` and the page's Projects routes, and the rail's subscription on
every other screen leaves it out. It is, for each of the last 28 UTC days, oldest
first, how many events touched the project's issues and how many of those were
closes, the last bucket being today so far. The count is one row per project per
day in `pulse`, written in the same transaction as the event (`lib/events.ts`),
so a pulse is 28 small rows per project rather than every event of four weeks,
which on 2026-09-30 was half of everything the deployment read. It is a stored
count, the one denormalisation here, and it cannot drift from what it summarises,
since nothing moves a row but the event it counts. `pulse:rebuild`, run on a cloud
deployment through `vp run -F @cairn/backend run:cloud`, recounts it from the events,
for a deployment that had events before the table did. Revised 2026-09-30 from days counted back from the caller's clock (cn-126).

### The web window

Settled 2026-09-21 on a static mock, `docs/mock/overview.html`, before any
component was written. The page a person opens answers two questions: what are
the agents doing, and does anything need me.

**A row is one of cn's lines, typeset.** The page does not print the padded
lines a terminal gets, and it does not word anything a second way either.
`parts.mts` gives each line its pieces, `healthParts`, `blockerParts`,
`logParts`, `stateParts`, `proofParts` and `changePieces`, and `lines.mts` is
those pieces joined and padded; the page imports the pieces through
`@cairn/cli/parts` and sets the same pieces in columns. The separators cn prints stay in the markup,
pale or not drawn, so the text of a row is the line. `apps/web/src/rows.test.tsx`
holds every row to that, which is how "the same health lines as `cn epic list`"
is checked rather than hoped for. Ruled out: a mono dump of the lines with the
references turned into links, which reads as a screenshot of a terminal.

The screens are the Overview at `/`, Projects at `/projects` with a page per
project at `/projects/<slug>`, Issues, one page per id (`/app-14`,
`/ep-3`, `/bl-2`) that renders what `cn show` prints, and the Log. Where the
deployment will not answer, the page shows its line and a field for the secret.
A picker for switching deployments in the page was planned here and taken out
on 2026-09-21: which deployments a browser knows about is part of running cairn
for more than one person. Settling that on 2026-09-29 needed no picker, since each
deployment serves its own page at its own URL (§13). The Overview's headline is the brief
said as a sentence, waiting first, in a fixed order, with a clause that has
nothing behind it set back in grey: `1 waiting on you. 2 in progress. 3 ready.`
That wording is the page's own, in `apps/web/src/brief.ts`.

Between the headline and what waits, a band: one tile per project in the order
`orderProjects` gives, most pressing first; its dot and slug, a link to
`/projects/<slug>`, its word as `projectWord` says it, the pulse `projects.list`
carries drawn as Projects draws it, closes in ink and every bar against the most
events any project had in a day, and under it `N live` with `N closed` in the 28 days,
which a project with nothing filed leaves off, its word having said so. The words are the page's own, the ones Projects already
uses, like the chart's legend; the band prints no cn line. The Overview subscribes to
the list with the pulse while it is on screen, as the Projects routes do, and draws
every day quiet until that answer lands. Added 2026-10-01 (cn-141), built to the mock
on ep-17.

Then "Up next": the first five of `cn ready`, each row `issueLine` typeset, with the
ready count beside the title, so the headline's count has something behind it on the
page. The rows are the heads `brief.get` already carries, five when the page asks
(`top`, `UP_NEXT` in `limits.ts`) and three for `cn brief`, which prints the same text
as before; the overview never subscribes to `ready.list` a second time, since the brief
computes readiness once per write for the headline already. Nothing where nothing is
ready. An issue row prints the revision as the line does, `r3`, pale and mono between
who holds it and the silence, which the rows had left out until this slice, since no
pin carried one. Added 2026-10-01 (cn-143).

Under the headline, each epic with a health row is its `cn epic list` block,
with the first line of the epic's description between the head line and the
rows, set small: the cut `cn show` gives an issue's fields, `…` after it where
more follows, and that mark a link to the epic's page, where the whole text is
set. The whole description stood there until 2026-10-01, when an epic that was a
wayfinder map made the overview that map and put the rows below the fold
(cn-140). The head line's counts carry a bar beside their text, done in ink, open
pale and follow-ups hatched, each its share of the three numbers the text names,
lightness only since chroma means state; the "Nothing moving" rows carry it too,
which is where ten epics read as progress at a glance. The bar adds no text to the
line (cn-142, 2026-10-01). With no epic showing a row, the two epics with the newest
`lastActivity` stand where the live ones would, each its head line, its
description's first line and the newest log line that landed in it, so the page
still says what the deployment has been doing; "Nothing moving" lists the rest,
and an epic shown above is not listed again. `lastActivity` on an `epics.list` row is the
newest write to the epic or to any issue under it, as the issues stamp it, the
same notion of activity the stuck line measures against, so an edge or a blocker
on its own moves nothing. Added 2026-09-24.

What the overview lists at scale, settled 2026-10-01 on ep-17 after invyte's worklist
of sixty issues and ten epics: an epic's text is one line; only an epic with a health
row shows rows, and the stuck ones are capped at three named; with nothing live, two
epics stand and the rest are a list; Up next is five rows and a count; the band is the
one grid on the page, and everything else is one column, because the page is read top
to bottom and the order of what it says matters more than filling the width.

A page for one id is `cn show` with room. An issue sets the brief's labelled lines,
`issueFacts`, by what each is rather than as one table (cn-146, 2026-10-01; until then
a state line opened the page and every fact was a row of one label-and-value table).
Each fact keeps cn's words and cn's order, in an element of its own carrying
`data-fact`; what the page adds beside one sits outside it. Its epic, project and
status are three tiles: the epic's reference with its count bar and counts where it is
open, the project's slug with its name and its word, and the status line led by the
state, `stateParts`' head (`moving balder/claude 2h`, `waiting`, `blocked`,
`stuck silent 9d`, `deferred until 2026-10-01`, `closed 2h ago`, `dropped 2h ago`,
`open`) in its tone, the priority a badge and the rest small. The proof a close stored,
the command in mono and its exit code a badge, or the reason a drop gave, is a card,
with the output the proof carries folded under it. Its edges are a neighbourhood, a row
per kind and a chip per issue named with its state's dot, every finished one marked
`done` or `dropped`, a `blocks` edge's finished end among them rather than the edge
dropped (§7), and `waiting on` and `blocked by` named there, once. The links are a list,
each link in cn's words with its label, or its URL, an anchor that opens in a new tab
(§3, "Links"). Then everything written into it, printed whole where the brief keeps a
first line and set as the Markdown it is (§3), as one document at the column's width,
then its whole journal where the brief carries the five newest (`show.get`
takes how many, and the page asks for `JOURNAL_MAX`; paging past that waits for
a journal that long), with its own history in the column where the Overview has
the feed. An epic is its health and every issue under it, the finished ones
included, which is more than `cn show ep-3` lists and is what a person opening
an epic came for. It opens on its track (cn-145, 2026-10-01): one cell per issue its
counts count, the done tasks first in the order they closed, then the live ones moving,
waiting, stuck and open, then the live follow-ups hatched, each cell in its state's
chroma and a link with the reference form as its tooltip; a legend in the page's words
under it, and beside that the epic's closes a day over 28 UTC days, counted from each
issue's `closedAt` and drawn as a project's pulse is. Its health rows follow, the stuck
and the waiting alone, since what is moving is the track's and the In progress group's.
A passage on any of these pages takes the column's width, as the sheet around it does;
it stopped at 68 characters until cn-144. Getting around is the point of the page: every reference
anywhere is a link, an issue names its epic above its title and steps to the
issue before and after it in the epic's order, the rail marks the epic on
screen, and one button copies the reference form,
`cn-26 "apps/web, the read-only window"`, because that is what a person pastes
into a session to say which work they mean.

Beside Copy reference, a round `?` chip opens the ask menu: at most four lines a person
can say to their agent about the thing on screen, chosen by its kind and state from what
the page already reads. `Explain cn-14 "…" in plain terms: what it's about and why it
matters` first on every issue, because understanding one comes before every other question
about it, and a follow-up's title is often in cairn's own words (added 2026-09-26, cn-78);
the line asks for meaning and leaves the answer's shape to the skill, which is the
reference on its own line and a short bold-led line each for what it is, why it matters
and where it stands, since "a few sentences" came back as one dense paragraph (cn-79,
2026-09-28); `Catch me up on cn-14 "…": where it stands, what's been tried,
what's left` on every issue; `cn-14 "…" has been quiet for 9 days. Find out why and tell
me what it needs to move` while it is stuck; `Is cn-14 "…" still worth doing? Make the
case either way` past fourteen days open; `ep-3 "…" has gotten messy. Help me sort it
out: duplicates, stragglers, what no longer belongs` while `cn review` lists anything, for
which the epic page reads `review.get`; `Help me decide bl-2 "…"` on a blocker nobody has
resolved. The wording is the page's own, in `apps/web/src/prompts.ts` beside the
headline's, and use will refine it. The line on screen carries the id and not the title,
because a title makes a menu hard to read; the clipboard gets the sentence with the
reference form whole, so the session it lands in knows what is meant and reads it with
`cn show` before answering, which the skill teaches. The menu is a speech bubble with
dialogue choices, numbered: the keycap is the cursor, a number copies its line, `?` opens
it from anywhere on the page. A pie menu was ruled out, since a sentence does not fit a
wedge; so was a short label over each sentence, which is two wordings of one prompt.
Added 2026-09-25.

The principle behind it, which is cn-72's: cairn runs behind the scenes. The person in
the loop speaks plain language, and nothing on the page asks anyone to run or paste a
command, not a `cn` line and not a slash command. Copying commands would make the person
the one steering their agents, which is another job.

**Projects.** Added 2026-09-30 (cn-127), built to the mock Balder settled on cn-123, `https://claude.ai/artifact/4SNvUM8MESoyRAbGacedYo` at version `1790717059-c337`, the way `docs/mock/overview.html` was the Overview's. The rail gets a Projects item between Overview and Issues and, above Epics, a section with every project: its dot, its slug and its live count, the name on hover, most pressing first. `/projects` opens on a headline with one clause per project in the same order, waiting, then stuck, then moving, then quiet, then nothing filed, in the page's own words (`apps/web/src/projects.ts`, beside the brief's): `app waits on you. tools is moving, with 2 stuck. admin has nothing filed.` Under it the chart: one lane per project, every live issue a dot placed left to right by how long since it last moved, on a log scale with three days at the middle and 45 days at the right edge, and top to bottom by priority, with each priority's limit from `thresholds.ts` drawn as the zone a dot is in once it is stuck; moving, waiting and stuck are the dot's chroma, and open is hollow. Then a section per project: its `cn project list` block, the head line and the health rows typeset the way an epic's are on the Overview, with the description and the links as chips between the head and the rows, and under the rows the pulse `projects.list` carries, one bar a day for 28 days with the closes in ink at the foot, beside one dot per live issue under each epic. `/projects/<slug>` is one project with room: the chart alone, the pulse beside the epic strips, then Moving, Waiting on you, Stuck and Open, each row `cn list --silent 0d`'s line with a meter of its silence against its priority's limit, and the closes of the last four weeks folded. It lives under `/projects/` because a slug may be `log` or `issues`, which are pages already. The page reads what `projects.list`, `issues.list` and `blockers.list` answer and decides nothing they do not: an issue is stuck because its project's health names it, and waiting because a blocker on the list holds it.

Six routes do not get a router. The path is the state, and one listener turns
every plain same-origin link into `history.pushState`, so components write
`<a href>` and nothing else: links work with a modifier held, render in a test
with no router around them, and keep the live subscriptions when clicked
(`apps/web/src/location.ts`). Whatever hosts the built page has to answer every
path with `index.html`. The feed's subscription to `events.recent` is the 30 the
column shows, since every write reruns it, and the Log holds its own at the 200
newest only while it is open, showing the feed's 30 until those answer, so moving
to it never blinks empty. Added 2026-09-30.

**The page is hosted by the deployment it reads.** `@convex-dev/static-hosting`,
installed in `backend/convex/convex.config.ts`, keeps the built page in the
deployment's own storage and serves it at the deployment's site URL: its `.convex.cloud`
URL with `.convex.site` in place and the region kept, which `cn doctor` prints. It answers
every path without an extension with `index.html`. cairn has no HTTP routes of its
own, so the component owns the site root, and anything cairn ever routes over HTTP
goes under `/api`. `#push:cloud` pushes the functions and then ships the page
(`backend/scripts/page.mjs`): the component reports the client URL the deployment
answers on, the page is built with `VITE_CAIRN_URL` set to it, and the files are
published in one mutation, so a failed upload leaves the last page up. The page and
the functions it calls go out in one command and cannot drift, and the upload is an
internal function, so only `convex run` with the deployment's own credentials ships
a page. Between the two it records the commit the functions came from as the
deployment's `CAIRN_PUSHED_FROM` (`backend/scripts/pushed.mjs`), with `-dirty` after it
where `backend/convex` held uncommitted changes, and `cn doctor` compares it with the
checkout `cn` runs from, by git: commits, never working trees, and `backend/convex/tests`
left out, so its last line says which side is behind and the one command that fixes it
(cn-91, 2026-09-29). Beside it the push records the deployment's name as `CAIRN_NAME`,
the `<name>` of `backend/.env.cloud.<name>.local` and what `cn init --name` calls it,
which the rail's big word, with the host under it, and the tab title read
(`deployment.name`): `Issues · invyte`, `cn-14 "…" · invyte`. Two tabs on two
companies' pages no longer both read "cairn". A deployment the push never reached, the
anonymous local one and a throwaway, has no name and reads `cairn` (cn-124). The
bundle names the deployment and never a secret: a person pastes the secret once, into
that origin's localStorage, and a reload does not ask again. The screen that asks is
the page's front door and speaks the page's words: "needs its secret" to a browser
that sent none, "refused the secret" to one that sent the wrong one, and "did not
answer" only for a deployment that never did. It names no config file, variable or
command, which are `cn`'s; the guard's line naming them is printed by `cn` alone
(cn-85, 2026-09-28). `vp
run dev:web` stays the loop for working on the page. Ruled out on 2026-09-24: one
shared hosted page that asks for a URL and a secret, because every visitor would
trust its host with a secret that can write, and one page would have to match every
deployment's version of the functions (identity auth does not fix the first, since
the code served acts as whoever signed in); a static host per person, which is a
second account and a second deploy to keep in step; and serving from the machine,
through a `cn web` or a login service, which leaves nothing on a phone. Added
2026-09-28, cn-70.

The look, and what each choice rules out:

- **Glass only on what floats**: the rail, the feed, the jump bar, the ask menu, a dialog.
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
- **Written text is set in the same terms** (`apps/web/src/Markdown.tsx`). A heading is
  weight and never outranks the page's own, a link is an underline, code is a tint,
  a quote is a rule, a task's box is ink or hollow; no hue anywhere, since chroma
  means state. react-markdown builds React elements, so raw HTML shows as text and a
  `javascript:` link goes nowhere. It is a quarter of the page's script, so it loads
  beside the page and not before it (`Prose.tsx`): the secret form and the first
  screen wait on 152 kB gzipped rather than 198, and a passage reads as written until
  it lands, or for good if it never does (cn-98, 2026-09-30).
- **A jump bar where a chat page has its composer.** Type an id or part of a
  title and go. It reads, like everything else on the page.
- **One motion nobody asked for**: an event arriving over the subscription lands
  in the feed with a sheen. It is the proof that no reload brought it.
- **One motion the reader asks for**: a control in the column's head collapses
  it to a strip and expands it again, and main takes the room. The column's
  width, main's margin and the jump bar's inset ease together on the page's one
  pace and curve, `--motion-duration` and `--motion-ease` in `index.css`, the
  contents fading rather than reflowing; `prefers-reduced-motion` turns it off.
  The choice is the browser's, kept in localStorage beside the secret and never
  the deployment's. Below 1100px the column is hidden, and that is its only state.
- **A second motion the reader asks for**: the ask menu opens with a pop, 220 ms with a
  little overshoot, and its lines settle one after another 40 ms apart. It is the one
  place the page allows itself a game's feel, and `prefers-reduced-motion` turns it off.
- **Light first, and dark as the second set of values for the same tokens**, under
  `.dark` on `<html>` and nothing else. The page follows the system's setting until
  the reader flips the switch in the rail's head, and the choice is kept in
  localStorage beside the secret and the column's state, never the deployment's. A
  script in `index.html` sets the class before first paint, so a dark page never
  flashes light.

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
| **`cn` CLI** | Every agent, every hook, every jq pipeline. One verb is one Convex function call plus formatting: the CLI holds no logic. Where a verb takes an action word (`epic new`, `dep rm`), each action is one function, and `cn update` runs its kind's own function, by the id. |
| **Claude Code plugin** | Skill, SessionStart and Stop hooks, slash commands, and the evals that hold the skill's rules in a real session. Ships from `plugins/cairn` in this repo so it versions with the code and installs anywhere, including cloud runners. |
| **`apps/web`** | The human's window, in two steps, split 2026-09-20. First a read-only page over `convex/react` subscriptions, which ships on the deployment's shared secret pasted once into the browser. The second step, acking and resolving from the page behind identity auth, was cn-11, dropped on 2026-09-28: the person ends a wait by telling their agent, which resolves on their word (§6). The skeleton, one live query inside the gate, landed 2026-09-20. What the page looks like and how it stays cn's words is §8, "The web window". |

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

The second consumer arrived on 2026-09-20 and did not need the typed client:
`apps/web` subscribes through `convex/react` and imports the generated `api`
from `@cairn/backend` by name, and what it shares with `cn` is the lines, through
`@cairn/cli`'s exports map (§8). So `packages/cli/src/lib/client.mts` stays the
CLI's own, and lifts into a package of its own only for a consumer that needs the
HTTP client with the secret spread in, an MCP wrapper, which there is not.

### How the parts talk

```
 a Claude Code session                               one Convex deployment per company
 ┌────────────────────────────────────┐              ┌────────────────────────────────────┐
 │ hooks (start, stop) ──  cn brief … │              │ schema.ts     the tables of §3     │
 │ SKILL.md           teaches the verbs│              │ issues.ts  epics.ts  journal.ts    │
 │ /cairn:* commands  ──  cn …        │  ── HTTPS ─► │ edges.ts  blockers.ts  ready.ts    │
 │ the agent          ──  cn <verb>   │  one typed   │ show.ts  brief.ts  review.ts       │
 └────────────────────────────────────┘  call per    │ projects.ts  events.ts  search.ts  │
       cn  (Node 24, .mts, no build)     verb        │ lib/  ids · revision · actor ·     │
       session.mts → deployment, actor               │       events · guard · verification│
                     from config.json, read once     └────────────────────────────────────┘
       client.mts → ConvexHttpClient                                 ▲
       verbs/*    → api.<module>.<fn> → ref()                        │
                                                                     │
 apps/web, later  ──  convex/react subscriptions to the same functions
```

- **Every hop is one typed Convex function call over HTTPS.** `cn` uses the HTTP
  client: one request, no socket, so a hook or a cron costs one process and one
  round trip. The web app uses the React client and subscribes to the same
  functions; nothing is written twice.
- **Every mutation takes `actor`**, and on a mutable field `revision`. The actor is an
  argument `cn` fills in, taken on trust (§13).
- **A subscriber sends the clock it loaded with.** Convex re-runs a subscribed query when
  data it read changes, never because time passed, so the stuck line and a `deferUntil`
  would go stale on a page left open. Every public query that reads the clock takes an
  optional `now` (`lib/clock.ts`); `cn` asks once and leaves it out. The page sends the
  clock it loaded with, and asks `clock.next` for the earliest moment after it at which any
  line drawn from the clock would change with no write: the next stuck, silent, quiet,
  deferral, nudge or inbox moment, or the next UTC midnight, when the pulse's buckets roll.
  It sets one timer for that moment, held while the tab is hidden; when it fires the page
  advances its clock to the present and every query reruns once. Each threshold is spelled
  once, as its moment, in `lib/thresholds.ts`, which the predicates and `clock.next` share,
  so a line cannot appear at a moment the timer did not wait for. Nothing validates `now`;
  a wrong one misleads only the caller that sent it. Revised 2026-09-30 from a clock
  rounded down to the minute, which reran every clock-reading query 1,440 times a day per
  open tab, hidden or not, for lines that change on hours and days.
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
teaches and the `--help` headers restate, and `packages/cli/src/contract.test.mts`
holds all three to the `spec` each verb declares: every flag a header's synopsis,
this table, the skill, the slash commands or the CLI's README names is one the
verb takes, and every flag a verb takes is in its header and in this table,
`--json` aside, which the line under the table states once. A verb takes flags
only unless its row names a positional, and refuses a stray one; `--help` and
`-h` are answered once, in `main.mts`, before any verb runs.

| Verb | Function | |
|---|---|---|
| `cn brief` | `brief.get` | query |
| `cn brief --unjournaled` | `brief.unjournaled`: the in-progress rows this session holds, with the brief's marks, for the Stop hook; the one flag that picks a function, since the hook runs at the end of every turn and the brief walks every open issue to answer it | query |
| `cn ready` | `ready.list` | query |
| `cn list [--project] [--epic] [--status] [--mine] [--silent] [--blocked]` | `issues.list`; `--silent <duration>` is what nobody has touched for that long and `--blocked` what a live `blocks` edge holds, both over live issues unless `--status` says otherwise, each row then carrying its silence or its holders | query |
| `cn search <text> [--project] [--status]` | `search.find`: the issues whose title or a link's URL or label holds the text, case aside, or whose description or a journal entry holds every word of it, each word found from its start, each issue with the field it was found in | query |
| `cn show <id> [--history]` | `show.get`: issue, epic or blocker by prefix | query |
| `cn log [--limit N] [--before <date>]` | `events.recent`: what happened across the deployment, newest first, each event with the issue, epic or blocker it names as id and title; an edge, recorded on both of its ends for their histories, is listed once, on the end that leads its sentence | query |
| `cn create --project app --epic ep-3 --title … [--priority] [--description] [--design] [--acceptance] [--type follow-up --kind verify --parent app-14] [--link <url>…]` | `issues.create` | mutation |
| `cn claim <id>` · `cn release <id>` | `issues.claim` · `issues.release` | mutation |
| `cn update <id> --revision N [--title] [--description] [--design] [--acceptance] [--priority] [--epic] [--defer-until] [--resolves] [--link] [--unlink]` | `issues.update`, `epics.update` or `blockers.update`, by the id: an epic takes its title, description and links, a blocker its title, `--resolves` and links | mutation |
| `cn journal <id> --kind finding <body>` | `journal.append` | mutation |
| `cn close <id> --revision N --run '<command>' \| --unverified <why> [--follow-up <title> --kind verify --priority 1] [--next <direction>]` | `issues.close` | mutation |
| `cn drop <id> --revision N --reason …` | `issues.drop` | mutation |
| `cn dep add\|rm <id> --blocked-by\|--blocks\|--related\|--discovered-from\|--duplicates\|--supersedes <id>` | `edges.add` · `edges.remove` | mutation |
| `cn wait <id> --kind approval --owner balder --title … --resolves … [--nudge <date>] [--link <url>…]` · `cn wait <id> --on bl-3` | `blockers.raise` | mutation |
| `cn waiting` | `blockers.list` | query |
| `cn ack <bl> [--said …]` · `cn resolve <bl> --note … [--said …]` | `blockers.ack` · `blockers.resolve` | mutation; an agent's carries `--said` |
| `cn epic new <title> [--description …] [--link <url>…]` · `cn epic list [--all]` · `cn epic close <id> --revision N [--drop --reason …]` | `epics.create` · `epics.list` · `epics.close` | |
| `cn project new <slug> --name … [--description …] [--link <url>…]` · `cn project update <slug> --revision N [--name …] [--description …] [--link <url>…] [--unlink <url>…]` · `cn project list` | `projects.create` · `projects.update`: the name, description and links against a revision; nothing changes a slug, since every issue id carries it · `projects.list` | |
| `cn review <epic>` | `review.get`: what a person and an agent look at together in one epic, one line each in the reference form; writes nothing | query |
| `cn doctor` | `projects.list`, as the ping; `deployment.pushedFrom`, as the functions line | query |
| `cn init --name … --url … [--secret-cmd …] [--host …] [--default]` · `cn init --refresh [--name …] [--secret-cmd …]` | `projects.list`, as the check; then it writes this machine's config, or, with `--refresh`, rewrites one deployment's secret from its stored command | query, local |
| `cn setting` · `cn setting <name> <state>` | none: it reads this machine's config, or writes one setting's state into it (§12) | local |

Every read verb takes `--json`. Every list line starts with the reference form.
On a stale-write error every write verb prints the events since the caller's
revision and the command to retry with.

### The reference form

Every journal entry, commit, handoff and `cn` output line that names an issue
or epic, and the first mention of one in a reply, carries its id **and** its
title:

    app-14 "fix connection retry"

A bare `app-14` there is a bug in the skill or the CLI. Beads ids like
`app-wu03.2` gave the reader nothing to hold on to, and a session's worth of
"working on wu03.2" was unreadable a day later. Later in the same reply, with
the form in sight above it, a bare id reads fine; settled 2026-09-27 from the
eval below, whose first three runs each slipped once on a later mention and
never on a first, while the reader's need was met by the form above. `cn show
<id>` prints a ten-line brief, every list line starts with the reference form,
and `--json` carries both fields. A URL into the web app slots in behind the
same form later. The form is spelled in one place, `ref()` in
`packages/cli/src/lib/ref.mts`.

The form is the floor, not the context, settled 2026-09-24. After a while in a
session, "what is next" was answered with "you can do cn-45, you can do cn-50",
and the person had to open the page to learn what had just been said to them.
The page is for status; a reply has to stand on its own. So the first time a
reply names an issue or epic in a session, it carries the form and then a
sentence of what the work is and where it stands, read from `cn show` rather
than invented; a later mention in the same session is the form alone; and
compaction or `/clear` makes every issue a first mention again, since the
explanation went with the context. The rule lives in the skill, as doctrine
does (§8), and the plugin ships an eval that holds it: a fresh session with only
the plugin and the brief in context, asked what is next, has to name every issue
with its title and say what each one is, so the bare list fails. The child reads
a stand-in `cn` recorded from the real one against a throwaway moments before,
because with Bash granted the eval's sandbox can read only the case's own
directory and reach no port, and the real `cn` is node under the home
directory. An eval runs a `claude -p` child on a person's credential, so it is
a verify-table row run by hand, not a CI step. The Stop hook does not police the rule: the hook carries
state, never doctrine, and a bare id inside a `cn show` line is not a slip.

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
| Runtime | Node 24, pinned by `.node-version`. `cn` runs its `.mts` source directly: Node strips the types, so there is no build step and a clone is the install: one of its own, kept at main and never worked in, because `cn` and the plugin every repository's sessions load both run from it, and a branch checked out there would reach all of them. The files that use a company's deployment, `backend/.env.cloud.<name>.local`, live beside it, so a push from it is main; a development clone holds only what developing needs. |
| Types | TypeScript 5.9 installed, for `convex dev`'s own check and vite-plus's peer range. `vp check`'s type check is the native compiler regardless. Erasable syntax only in `packages/cli`: no enums, namespaces or parameter properties. |
| Packages | pnpm, driven by `vp install`. `workspace:*` between packages; `@cairn/cli` imports the generated `api` from `@cairn/backend` by name. |
| Check | `vp check`: oxfmt, oxlint, and a type-aware check across every tsconfig. Markdown and yaml are left as written. |
| Tests | `vp run -r test`: vitest per package. The backend runs `convex-test` in the edge runtime, which is closer to Convex's own than Node is. |
| The gate | `vp run verify` is check plus every test, about a second. A pre-commit hook (`vp config`, once per clone) formats and lints staged files, a Claude Stop hook refuses to end a turn with a changed file failing `vp check`, and CI runs the same gate. `AGENTS.md` carries the per-change table. |
| End to end | `vp run verify:e2e` runs the per-verb rows of `AGENTS.md` with the real `cn` against a throwaway anonymous local deployment on its own ports and state directory, empty by construction and deleted afterwards. Decided 2026-09-17: automated verification never targets a deployment agents work in. A Convex preview deployment is the later option. |
| Local backend | `CONVEX_AGENT_MODE=anonymous npx convex dev` runs a local deployment with no Convex account, and is how `convex/_generated` was first produced. `convex codegen` alone refuses to run without a deployment. |
| CI | `voidzero-dev/setup-vp`, then the gate, `vp run -F @cairn/web build` and `vp run verify:e2e`; none needs a Convex account. |
| Web | `apps/web` is Vite 8 and React 19 through the same pinned vite-plus: `vp dev`, `vp build` and `vp test run`, with `@vitejs/plugin-react` 6 for Fast Refresh. Proved on 0.1.24 on 2026-09-20, which until then had only run check and test here. Its tests render to a string with `react-dom/server`, so the suite carries no DOM. Tailwind 4 through `@tailwindcss/vite` and shadcn's components came in on 2026-09-21, on the same 0.1.24: `vp dlx shadcn@latest add <component>` writes into `src/components/ui/`. shadcn's registry now generates `import { cn } from "cn"`, an npm package that ships a binary named `cn`; it is not installed here, because in this repo `cn` is the CLI, and `src/lib/utils.ts` carries the helper over clsx and tailwind-merge instead. Recursive is self-hosted from `@fontsource-variable/recursive`. |

Three things pinned, and why:

- **vite-plus is pinned in the catalog**, 0.1.24 for `vite-plus`, `vite` and
  `vitest` alike, and the three move together. The `latest` tags mix a 0.3.x core
  with the 0.1.x test package that 0.3.x no longer uses, and `vp check` then dies
  on "Cannot find native binding" before doing anything. The global `vp` need not
  match it: it hands check, test and build to the checkout's own copy, and
  `vp --version` lists both. A global of 0.3.1 or later also brings the pnpm that
  `packageManager` names, which 0.1.x does not. Until 2026-09-29 this rule tied
  the global to the catalog too. It was dropped when a global 1.0.0, the
  installer's latest, over the catalog's 0.1.24 ran `vp install`, `vp run verify`
  and `vp run verify:e2e` green on a fresh Mac. CI still installs the global at the
  catalog's version, since `setup-vp` reads it from `package.json`, and sets pnpm
  up beside it.
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
- **No capabilities.** A machine declares nothing about what it can do, and `ready`
  filters and marks nothing by it (§5, cn-116, 2026-09-29).
- **No epic-to-epic edges.** Epics relate through their issues or not at all.

Added when the solution was mapped, 2026-09-17:

- **The actor `cn` sends** is `CAIRN_ACTOR` when set, else `<host>/<user>`, with
  `kind: agent` when `CLAUDECODE` is in the environment (Claude Code sets it for
  every shell it runs) and `human` otherwise. So a session on Balder's WSL box is
  `balder-wsl/claude` and Balder at a terminal there is `balder-wsl/balder`. `<host>` is `CAIRN_HOST`,
  then the config's `host`, which `cn init --host` writes, then the OS hostname up to
  its first dot and lowercased (since 2026-09-29, so a Mac's `Balders-Mac-mini.local`
  reads `balders-mac-mini`). The host tells people apart as well as machines, so
  `/cairn:init` proposes one that carries the person's first name, `<person>-<machine>`,
  and nothing checks what is chosen (2026-09-29, cn-121). Since 2026-09-22 it
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
  and an issue is stuck once it sits open, unclaimed and unheld past its
  priority's limit, P0 a day, P1 3 days, P2 a week, and P3 and P4 never, so a
  quiet backlog is not stuck (`STUCK_AFTER_MS`; revised 2026-09-29, cn-129, from
  the one issue silent longest past 3 days, which named a P4 in nearly every
  epic). Revised 2026-09-22 from "released" and "raised" (§7). A claim
  with nothing journaled for an hour, counted from the later of the claim and
  its newest entry, is what the Stop hook hands back (§8, `JOURNAL_QUIET_MS`,
  added 2026-09-22).
- **Near-identical titles** are titles equal after lowercasing and replacing every
  run of non-alphanumerics with one space, or within Levenshtein distance 2 of
  each other after that (`NEAR_TITLE_DISTANCE`). `cn create` hands the matches
  back before the duplicate exists and `cn review` lists any pair that got
  through; a `duplicates` edge between them is the answer given (§7).
- **`ep-0` is the inbox**, created by the first `issues.create` that needs it.
- **The deployment config** grows two fields, both machine-local:
  `{ "default": "acme", "deployments": { "acme": { "url": …, "secretCmd": … } } }`.
  A repository names which of them it uses with `CAIRN_DEPLOYMENT` (§13).
- **Settings are per machine, and off until turned on** (2026-10-04, cn-153). A setting
  is behaviour beyond the worklist that some
  people want cairn to drive and others do not, so nobody's sessions change until they
  ask. It lives in the machine's config, `"settings": { "<name>": "<state>" }`, beside
  the deployments and above any one of them: a way of working is a person's, and should
  not need each repository or each company's worklist to carry it. So there is no
  per-repository setting and no environment variable over the file, which would be one,
  and a setting kept on the deployment, a company's policy, waits for a real one. A
  setting has states: `off`, where every one starts and which is absence from the file,
  and the setting's own past it, which say how far the person wants cairn to go
  (2026-10-04: a plain on would make a session either silent or automatic, and a person
  in the conversation may want to be asked first). `cn setting` lists them and puts one in a state, and the person asks for that
  in their own words. cn stores a setting and prints it and never acts on one: `cn brief`
  ends with each name that is not off and its state, `cn doctor` names them, and the
  skill says what a session does on reading one there, so the behaviour
  reaches any harness that runs `cn`. Claude Code's plugin options (`userConfig`) are not
  the store, since a `cn` run outside Claude Code would never see them. There is no
  setting yet (2026-10-05, cn-159): the first, `next-session`, went when what it gated
  turned out to be a person's way of working and the part that was the worklist's moved
  into `cn close --next` (§4), which nothing gates. The system stays for the next one,
  which has to pass the same test: how the worklist is left and read, never how sessions
  are run. A name an older cn wrote into the file is kept and reads as off.
- **The deployment secret.** One shared secret per deployment, `CAIRN_SECRET` in its
  environment, checked by `lib/guard.ts` on every public function and stripped from the
  arguments before the handler, so nothing downstream sees it. A deployment with none set
  checks nothing, which is what keeps the anonymous local one open. `cn` sends it from
  `~/.config/cairn/secrets/<name>`, which `cn init` writes beside the config and never
  into it, since the config is the file an agent reads to see how a machine is set up and
  must hold nothing that cannot be printed (2026-10-02, cn-152, after two secrets reached
  a transcript that way); a secret an older cn cached in the file is read until
  `cn init --refresh` moves it, and `cn doctor` names the move; `CAIRN_SECRET` in the
  shell wins. It fences a deployment; it does not tell actors apart, which stays §13. It
  is set by `vp run -F @cairn/backend secret`, one operation each for `new`, `rotate` and
  `revoke`, which hands the value to 1Password or to stdout and never to stderr. `revoke`
  fences the deployment with a secret nobody holds rather than removing it, since a
  deployment with none is open; and a shared secret cannot revoke one machine, only all
  of them, which is the price of running on trust (§13). `cn init` keeps the command
  that printed the secret as `secretCmd`, so `cn init --refresh` takes a rotated one onto
  a machine by running it again.
- **A verification record with `exitCode ≠ 0` cannot close an issue.** The
  choice is `--unverified` with a reason, or fix it.

---

## 13. Deferred

Not forgotten and not assumed. Each is to be settled against real usage during
implementation.

| Open question | Current lean |
|---|---|
| How a session resolves repo → project → deployment | Settled 2026-09-29 (cn-89): `CAIRN_URL`, then `CAIRN_DEPLOYMENT`, then the config's `default`. `CAIRN_DEPLOYMENT` names a deployment in `~/.config/cairn/config.json` and takes its URL from there and its secret from `secrets/<name>` beside it. A repository sets it in the `env` of its Claude settings, which reaches every Bash call and both hooks, `settings.local.json` over `settings.json`; it is a name, never a URL or a secret, so a tracked file may carry it. A name the machine lacks is an error naming the ones it has, and the SessionStart hook prints that line. A project is coarse, so path-derivation stays out, and there is no `.cairn` file in a repo. `cn init` writes the file: checked before written, added and never replaced, and `--refresh` rewrites one deployment's secret, the one `CAIRN_DEPLOYMENT` names when no `--name` is given, mode 600 |
| Short ids for epics | Settled 2026-09-17: `ep-7`, one global counter, minted like issue ids; blockers likewise as `bl-3`. §3 |
| Local or cloud deployment for the throwaway window | Settled 2026-09-29 (cn-92): a company's worklist is the development deployment of a Convex project of its own, `cairn-<name>` unless named otherwise. `#new:cloud` makes it with `convex dev --configure new --skip-push`, so no function runs there before `#secret -- new` has fenced it, and `#push:cloud` pushes to it with the login alone. A production deployment would need `convex deploy` and a deploy key, and buys a worklist nothing yet. The anonymous local deployment stays the development copy, and the throwaway stays the tests' (§11) |
| Auth | Lean, slice 8: one shared secret per deployment, `CAIRN_SECRET` in the deployment's env and `secrets/<name>` beside the machine's config, checked by a `lib/guard.ts` wrapper on every public function and skipped when the deployment has none set, so the local anonymous one stays open. Settled 2026-09-29 (bl-4): that secret stays the only check, and no identity auth is planned, for more than one person either (the last row). The actor stays an argument; the page writes nothing, since cn-11, which would have had it ack and resolve behind identity auth, was dropped on 2026-09-28. The read-only window sends the same shared secret `cn` does, pasted into the page and kept in that browser's localStorage, never in the bundle; the dev server alone also takes it from `CAIRN_SECRET`, so a developer's machine does not ask |
| Who counts as the actor on a journal entry or a claim | Settled 2026-09-29 (bl-4): the argument `cn` sends (§12), taken on trust. There is no token to take it from instead |
| Which project a session is in | Settled 2026-09-29 (cn-93): the repository's `## cairn` section maps its parts to projects, in `CLAUDE.md` when the repository is wired for everyone who opens it and in `CLAUDE.local.md` when it is wired for one machine. `/cairn:init` writes it, and the skill reads it to pick `--project` on `cn create`. Where another tracker stays on, its last line says which one gets new work (cn-96). It is prose for an agent, so `cn` still derives nothing from a path, and there is still no `.cairn` file in a repo. The brief's `projects` line names every project on the deployment, the section only the ones the repository maps, so the skill reads `cn project list` for work that fits none of its rows and asks when more than one could fit; `/cairn:init` drafts the section from the deployment's projects, the table mapping directories to slugs and the description staying the one place that says what a project is (cn-128, 2026-09-30) |
| The 136 issues in the first company's beads graph | Nothing now; likely a partial import later |
| A push channel for human blockers | None. The session is the channel (§6) |
| Where the page is hosted | Settled 2026-09-28: by the deployment it reads, at its `.convex.site` URL, shipped by `#push:cloud` after the functions (§8, "The web window"). Not one shared page for every company, which would hold a secret that can write for every visitor and have to match every deployment's functions at once. With a page per deployment, no browser needs to know about more than one, so there is no picker (the next row) |
| Running cairn for more than one person | Settled 2026-09-29 (bl-4, cn-28): on trust. Nothing is enforced, and there is no member list, no key per person and no identity auth. **Agents** are told apart by `session` beside the actor's name (2026-09-22, §5, §12), which is the part of identity a claim depends on. **Machines and people** are told apart by the host in the name, `<host>/claude`, which carries the person's name as well as the machine's, `balder-mac-mini/claude` beside a colleague's `maya-mac/claude`; `/cairn:init` proposes such a name and takes whatever is chosen (cn-121). **Handing it over** is the README's "Joining a worklist that exists" for a colleague (cn-111), and "Get started" for someone standing up a worklist of their own. **The page's deployment picker** is not needed: each deployment serves its own page (cn-70). What trust costs: anyone holding a deployment's secret writes under any name they give, and one person cannot be shut out without rotating the secret for everyone |

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
installed 1.2.2 binary) plus the first company's live 136-issue beads
database.

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
| Linear / ADO / GitLab / Notion / GitHub / Jira integrations | ~15,000 | No — a pull request is a link (§3 "Links") |
| `formula` (molecules, swarms, gates) | 5,252 | No |

### Structural findings that shaped this design

- **There is no epic entity.** An epic is `issue_type = 'epic'` plus
  `parent-child` dependency rows, and children get dotted ids
  (`app-lm5.4`) minted from a `child_counters` table that is **purely local
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
README made this conditional on the beads trial (`app-1ck`) ending in a no;
that condition is superseded by the decision to build it here and dogfood it on
its own construction before it goes anywhere near Invyte.
