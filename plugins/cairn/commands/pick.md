---
description: Claim the next piece of work and say what you will do first.
argument-hint: "[id]"
allowed-tools: Bash(cn:*)
---

If `$ARGUMENTS` names an issue, that is the one to take.

Otherwise run `cn ready --json` and take the first row whose `cannot` is empty — the rows
are already in priority order, and one with a `cannot` needs something this session does
not have. If every row has a `cannot`, say so, name what they need, and claim nothing.

Then `cn claim <id>`, `cn show <id>`, and report: the issue in the reference form, what it
asks for, what it is blocked by or blocks, and what you will do first. If the claim is
refused it is already somebody's; say who holds it and since when, and stop.
