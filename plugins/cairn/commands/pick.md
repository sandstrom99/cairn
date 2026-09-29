---
description: Claim the next piece of work and say what you will do first.
argument-hint: "[id]"
allowed-tools: Bash(cn:*)
---

If `$ARGUMENTS` names an issue, that is the one to take.

Otherwise run `cn ready` and take the first row this session can finish. The rows are
already in priority order. One whose title or description says it needs a phone, or one
particular machine, that this session does not have is for another session: `cn show` it
when the title alone does not say. If no row is this session's, say so, name what they
need, and claim nothing.

Then `cn claim <id>`, `cn show <id>`, and report: the issue in the reference form, what it
asks for, what it is blocked by or blocks, and what you will do first. If the claim is
refused it is already somebody's; say who holds it and since when, and stop.
