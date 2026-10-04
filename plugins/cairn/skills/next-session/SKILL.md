---
name: next-session
description: Leave the worklist for the next session. Use at the end of a session whose cairn work has closed, when the session's opening brief has a `settings` line naming `next-session` - then do it unprompted, right after the last `cn close`, before the final reply. Also use when the person asks for the prompt a fresh session should open with ("what should the next session pick up", "write the next prompt"), whatever the settings say. Do not use when the brief has no such line and nobody asked. Reads what the close unblocked, picks the next chunk, and leaves a paste-ready prompt in the reply and on the worklist.
---

# Leaving the worklist for the next session

A session that ends with "done" leaves the next one to be started by hand: somebody reads
the worklist, decides what is next and types a prompt. With `next-session` on, a session
does that itself as its last act, so a series of sessions carries on from the worklist,
with a person watching or without one.

**When.** The brief's `settings` line names `next-session`, and this session's work has
closed: every issue it claimed is closed, dropped or released, and it holds nothing. Or
the person asks for the next session's prompt in their own words, which needs no setting.

**When not.** The session still holds a claim: that is a `handoff` entry on the issue,
as always, and nothing more. Or it touched nothing on the worklist.

Two things come out: a prompt a fresh session can open with, in the reply, and the same
prompt on the worklist, where a session or a loop that opens cold finds it.

## 1. Read what is next

- **What the close unblocked.** The `ready` lines `cn close` printed under each issue
  this session closed come first.
- **The frontier.** `cn ready --json`, the epics this session worked in before any other.
- **Each candidate.** `cn show <id>`: what it is, where its contract is (its design, its
  acceptance, a `decision` entry it points at), what blocks it, and who holds it.

Not a candidate: an issue in progress, which is somebody's claim; work the person said
to leave for them, in this session or on the issue; an issue whose title or description
says it needs a device or a machine a session like this one does not have; and anything
held by a blocker, which is waiting on a person and not on a session.

## 2. Choose the chunk

One issue is the default: the first candidate in the order above. More than one only
when they are independent, with no edge between them in either direction, nothing one
produces that another reads, and no file in common, and only when the person ran this
session that way. How many sessions run at once, and how, is the person's way of working
and never cairn's to decide; take it from how they opened this one.

## 3. Write the prompt

A fresh session has none of this context and can read the worklist for itself. The
prompt is one paragraph of prose that carries what `cn show` cannot:

- **The chunk**, each issue in the reference form with a sentence of what it is, and
  where its contract is when that is not on the issue itself.
- **What it builds on**, in a clause: what landed this session that the next one stands on.
- **The person's rules for the work**, in their words: what they said at the start of
  this session about how to work, what to ask before doing, and what to leave alone.
  Whatever they opened this session with beyond the work itself opens the next one too,
  as they typed it.

What it never carries: a plan for the work, a verdict on this session's, or anything the
issue already says. The next session plans; this one points. It needs no instruction to
hand off in its turn, since the next session reads the same `settings` line.

## 4. Record it, then reply

Put it where the next session finds it, as a `handoff` entry on the last issue this
session closed: a first line that stands alone, `Next: app-35 "retry on reconnect"`, and
the prompt under it in a fenced block. A journal entry lands on a closed issue as it
does on an open one.

````bash
cn journal app-31 --kind handoff @- <<'EOF_ENTRY'
Next: app-35 "retry on reconnect", which app-31 unblocked.

```
<the prompt>
```
EOF_ENTRY
````

Then the reply ends with one line of what closed and what that unblocked, by name, and
the prompt in a fenced block, ready to paste. Whatever else the person's own rules ask
of a final reply stays as it is.

## When nothing is next

When nothing is ready that a session can take, write no prompt. Say that plainly, name
what is left and whose it is, as `nothing is ready; bl-4 "pick a provider" waits on you`,
and record that sentence as the `handoff` entry instead. Do not reach into another epic
to fill the gap: a loop that reads "nothing is ready" stops, which is the right end.
