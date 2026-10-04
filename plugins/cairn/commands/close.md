---
description: Close an issue with the evidence that it is done.
argument-hint: "<id>"
allowed-tools: Bash(cn:*)
---

The issue is `$ARGUMENTS`.

Read it first with `cn show <id> --json` for its current revision, then close it with
`cn close <id> --revision N --run '<the command that proves it>'`. The deployment runs
nothing; the command runs here, and its exit code and output tail are the record.

When the proof cannot run here — a device, a store, a person — record what you do have
with `cn journal <id> --kind evidence "…"` first, then close `--unverified` with a reason
that points at that entry.

Anything left over is a follow-up, never a hanging parent:
`--follow-up "<title>" --kind verify|decide|cleanup`, its title saying what finishing it
needs, as `verify: the retry path on an iPhone`.

A `ready` line under the answer is an issue this close unblocked: it is the next thing to
pick, and no `cn ready` is needed first.

Where the brief this session opened with has a `settings` line naming `next-session`, and
this close leaves the session holding nothing, load the plugin's `next-session` skill
before the final reply. With no such line, do not.
