---
name: cairn
description: >
  The agent worklist. Use for any work that spans sessions, machines or agents: what is
  ready, what is in progress, what is waiting on a human, what a task is and what happened
  to it. Trigger on "what's ready", "track this", "pick up where we left off", "what is
  app-14", "close this", "log a finding". Also trigger, unprompted, on a sentence that
  names an issue, epic or blocker in the reference form and asks what it is about, where
  it stands, why it is quiet, what it is waiting on, whether it is still worth doing, what should happen
  next, or for help deciding: read it with `cn show` or `cn review` before answering.
  Everything goes through the `cn` CLI.
allowed-tools: "Bash(cn:*)"
version: "0.1.0"
---

# cairn

The worklist every agent and every machine shares, held on one Convex deployment and
driven entirely through the `cn` CLI. With a deployment configured, this session opened
with `cn brief` in its context: the counts, what is ready, what is in progress and who
holds it. That is state — everything below is how to act on it. On a machine where the
session opened instead with "not set up on this machine", run `/cairn:init` before
anything else: no verb below can work until the config exists. Where it opened with
"cairn: <name> did not answer; cn doctor says why", a deployment is configured and the
call to it failed: run `cn doctor` and read its last line before any verb, and hand the
person what it names if it is the URL or the secret, since neither is yours to change.

## The one rule that must not slip

**Every mention of an issue or epic carries its id and its title**, in this form:

```
app-14 "fix connection retry"
```

In a reply, a journal entry, a commit message, a handoff. A bare `app-14` is a bug: the
reader has nothing to hold on to, and a session's worth of "working on wu03.2" is
unreadable a day later. Every `cn` list line starts with this form; copy it, do not
shorten it. `cn show app-14` prints a ten-line brief when you need more.

## What cairn is for

| Use `cn` when | Not `cn` |
|---|---|
| The work outlives this session | A checklist for the next twenty minutes |
| Another agent or machine may pick it up | A note to yourself in this conversation |
| It blocks on a human, a device, a decision | Something you can finish now |
| A finding or a decision must survive compaction | The reasoning that led to it |

Tasks only. Not a wiki, not a knowledge base. A finding is a journal entry; a decision is
an issue.

## The verbs

| Verb | Does | Backed by |
|---|---|---|
| `cn brief` | the session-start report, under 20 lines | `brief.get` |
| `cn ready [--can …]` | what can be started, by priority, with what this session cannot do marked | `ready.list` |
| `cn list` | issues by project, epic, status, or `--mine` | `issues.list` |
| `cn show <id> [--history]` | the brief: reference, epic, status, who, since when, neighbours, journal | `show.get` |
| `cn log [--limit N]` | what happened across the deployment, newest first: who claimed, closed or raised what | `events.recent` |
| `cn create` | a new issue; `--epic` is required and the verb offers candidates; a near-identical open title in the epic is printed under the line | `issues.create` |
| `cn claim <id>` · `cn release <id>` | atomic, first writer wins, no lease | `issues.claim` · `issues.release` |
| `cn update <id> --revision N` | title, description, design, acceptance, priority, epic, defer, requires | `issues.update` |
| `cn journal <id> --kind …` | append a `finding`, `decision`, `handoff`, `evidence` or `question` | `journal.append` |
| `cn close <id> --revision N --run '<cmd>'` | runs the command and records it, or `--unverified <why>`; `--follow-up` spawns the residue; an `--unverified` close with no `--follow-up` gets a verify follow-up spawned beside it, and the close of an epic's last issue prints the `cn epic close` line | `issues.close` |
| `cn drop <id> --revision N --reason …` | closed without doing, never silently | `issues.drop` |
| `cn dep add\|rm <id> --blocked-by <id>` | the graph; also `--blocks`, `--related`, `--discovered-from`, `--duplicates`, `--supersedes` | `edges.add` · `edges.remove` |
| `cn wait <id> --kind … --owner … --title … --resolves …` | raise a human blocker, or `--on bl-3` to attach one that exists | `blockers.raise` |
| `cn waiting` | what is blocked on a human | `blockers.list` |
| `cn ack <bl>` · `cn resolve <bl> --note …` | humans only | `blockers.ack` · `blockers.resolve` |
| `cn epic new\|list\|close` · `cn project new\|list` | the containers; `epic list` prints a health block each, `epic close` is refused while a task is open | `epics.*` · `projects.*` |
| `cn review <epic>` | what to look at in an epic, one line each: near-identical titles, inbox items past 7 days, blockers past their nudge date, silent claims, unverified closes with no follow-up, blocks edges into finished issues, and whether it can close. Writes nothing | `review.get` |
| `cn doctor` | node, the generated api, whether the deployment answers | `projects.list` |
| `cn init --name … --url … [--secret-cmd …]` | sets a machine up: writes the config, after checking the deployment answers and takes the secret | `projects.list`, as the check |

Every read verb takes `--json`. Every write to a mutable field carries the revision that
was read; a stale write comes back with what changed and who changed it, and the right
move is to re-read and decide, never to force. `cn <verb> --help` is that verb's
contract, in full. A verb takes flags only unless its contract names a positional, and
refuses one it does not: `cn ready ios` is a usage error, since it means `--can ios`.

## A session's shape

- **Start.** The brief is already above. `cn ready` for the whole list, `cn show <id>`
  for the one that looks right, `cn claim <id>` before touching anything.
- **During.** `cn journal <id> --kind finding` or `--kind decision` the moment something
  would be lost to compaction. `cn wait <id>` the moment the work needs a person.
  `cn dep add <id> --blocked-by <other>` when one thing turns out to block another.
- **End.** `cn journal <id> --kind handoff` saying where it stands, what is unverified and
  what is next. Then `cn close <id> --revision N --run '<cmd>'` when it is done, or
  `cn release <id>` when it is not, so the next session can take it.
- **With the person.** `/cairn:review <epic>` goes through `cn review` together: what to
  look at, and the verb for each line. It writes nothing.

## Writing into an issue

Description, design, acceptance, an epic's description and every journal entry are
Markdown, and the person reads them on the web page, set: headings, lists, bold, links,
code, tables. A wall of plain text is what the page is there to avoid.

- **The first line stands alone.** It is all `cn show` prints of a field and all `cn log`
  prints of an entry: a plain sentence that says what this is, never a heading.
- **Give the rest a shape.** Short paragraphs; `- ` lists; numbered steps where order
  matters; a `**bold lead.**` to open an item a reader will scan for; a table where
  options compare; `### A heading` only when a field holds several parts.
- **Acceptance is a `- ` list**, one criterion a line, each answerable yes or no.
- Commands, paths and ids in backticks, and output in a fenced block. A link as
  `[what it is](url)`. No raw HTML: the page shows it as text.

## When the person speaks plainly

The web page offers the person lines to say, never commands to run: "Explain cn-14 "…"
in plain terms: what it's about and why it matters, in a few sentences", "Catch me up on
cn-14 "…": where it stands, what's been tried, what's left", "cn-14 "…" has been quiet
for 9 days. Find out why and tell me what it needs to move", "ep-3 "…" has gotten
messy. Help me sort it out". A message that names an issue, epic or blocker in the
reference form and asks about it is one of these, whether or not it came from the page.
Read before answering, every time: `cn show <id>` for an issue or a blocker, with
`--history` when the question is what happened or what was tried; `cn show <ep>` and
`cn review <ep>` for an epic. Then answer in the person's terms — where it stands, what
has been tried, what it needs, what the options cost — and take the verb that follows
yourself: `cn claim <id>` for "pick it up", `cn wait <id>` for what needs them, `cn dep
add` for a duplicate found. Never hand back a `cn` line or a slash command for the person
to paste. Steering agents is not their job.

"Explain" asks for meaning, not status, and quickly. Where the issue has no description,
a follow-up often has only a title in cairn's own terms, with its context on the parent:
read the parent, and the epic, before answering. Then three to five plain sentences: what
the problem is and who meets it, why the issue exists, and in one line how big it is and
where it stands. No file, function or event names, no ids past the first reference, no
list of cases; the person asks "catch me up" for the rest.

## Three boundaries

- **Agents raise human blockers. Agents never resolve them.**
- **Closing takes evidence.** A command and its output, or `unverified` with a reason.
  Prose is what an agent fabricates.
- **Residue becomes a follow-up, not a hanging parent.** Verified on Android and web but
  not iOS: close it, spawn `[follow-up · verify] requires: ios`, move on.
