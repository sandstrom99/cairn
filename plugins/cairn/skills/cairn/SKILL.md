---
name: cairn
description: >
  The agent worklist. Use for any work that spans sessions, machines or agents: what is
  ready, what is in progress, what is waiting on a human, what a task is and what happened
  to it. Trigger on "what's ready", "track this", "pick up where we left off", "what is
  app-14", "close this", "log a finding". Everything goes through the `cn` CLI.
allowed-tools: "Bash(cn:*)"
version: "0.0.0"
---

# cairn

> **Nothing is built yet.** `cn doctor` is the only verb. This file is the language the
> first slice will speak; it is written before the verbs so the verbs are built to it.

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

## The verbs, as they will exist

| Verb | Does | Backed by |
|---|---|---|
| `cn brief` | the session-start report, under 20 lines | `brief.get` |
| `cn ready [--can …]` | what can be started, by priority, with what this session cannot do marked | `ready.list` |
| `cn list` | issues by project, epic, status, or `--mine` | `issues.list` |
| `cn show <id>` | the brief: reference, epic, status, who, since when, neighbours, last journal entries | `show.get` |
| `cn create` | a new issue; `--epic` is required and the verb offers candidates | `issues.create` |
| `cn claim <id>` · `cn release <id>` | atomic, first writer wins, no lease | `issues.claim` · `issues.release` |
| `cn update <id> --revision N` | title, design, acceptance, priority, epic, defer, requires | `issues.update` |
| `cn journal <id> --kind …` | append a `finding`, `decision`, `handoff`, `evidence` or `question` | `journal.append` |
| `cn close <id> --run '<cmd>'` | runs the command and records it, or `--unverified <why>`; `--follow-up` spawns the residue | `issues.close` |
| `cn drop <id> --reason …` | closed without doing, never silently | `issues.drop` |
| `cn dep add\|rm <id> --blocked-by <id>` | the graph; also `--blocks`, `--related`, `--discovered-from`, `--duplicates`, `--supersedes` | `edges.add` · `edges.remove` |
| `cn wait <id> --kind … --owner …` | raise a human blocker, or `--on bl-3` to attach one | `blockers.raise` |
| `cn waiting` | what is blocked on a human | `blockers.list` |
| `cn ack <bl>` · `cn resolve <bl>` | humans only | `blockers.ack` · `blockers.resolve` |
| `cn epic new\|list\|close` · `cn project new\|list` | the containers | `epics.*` · `projects.*` |
| `cn reconcile <epic>` | facts acted on, judgement raised to a human | `reconcile.run` |

Every read verb takes `--json`. Every write to a mutable field carries the revision that
was read; a stale write comes back with what changed and who changed it, and the right
move is to re-read and decide, never to force.

## Three boundaries

- **Agents raise human blockers. Agents never resolve them.**
- **Closing takes evidence.** A command and its output, or `unverified` with a reason.
  Prose is what an agent fabricates.
- **Residue becomes a follow-up, not a hanging parent.** Verified on Android and web but
  not iOS: close it, spawn `[follow-up · verify] requires: ios`, move on.
