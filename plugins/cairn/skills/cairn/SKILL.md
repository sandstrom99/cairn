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
| `cn ready` | what can be started, by priority, with what this session cannot do marked | the readiness query |
| `cn show <id>` | the brief: reference, epic, status, who, since when, last journal entries | `issues.show` |
| `cn create` | a new issue; `--epic` is required and the verb offers candidates | `issues.create` |
| `cn claim <id>` | atomic, first writer wins, no lease | `issues.claim` |
| `cn journal <id>` | append a `finding`, `decision`, `handoff`, `evidence` or `question` | `journal.append` |
| `cn close <id>` | takes a verification record: what ran and what it said, or `--unverified <why>` | `issues.close` |
| `cn waiting` | what is blocked on a human | the blockers table |
| `cn brief` | the session-start report, under 20 lines | the hook |

Every read verb takes `--json`. Every write to a mutable field carries the revision that
was read; a stale write comes back with what changed and who changed it, and the right
move is to re-read and decide, never to force.

## Three boundaries

- **Agents raise human blockers. Agents never resolve them.**
- **Closing takes evidence.** A command and its output, or `unverified` with a reason.
  Prose is what an agent fabricates.
- **Residue becomes a follow-up, not a hanging parent.** Verified on Android and web but
  not iOS: close it, spawn `[follow-up · verify] requires: ios`, move on.
