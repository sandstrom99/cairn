---
description: Write the handoff entry that lets another session pick this up.
argument-hint: "[id]"
allowed-tools: Bash(cn:*)
---

The issue is `$ARGUMENTS`, or the one this session claimed when that is empty.

Write it with `cn journal <id> --kind handoff @-` and the body as a heredoc on stdin, so
no quoting touches it: where the work stands, what is done, what is unverified, and what
the next step is. Name files and commands, not feelings — the reader is another agent
with none of this context, and a journal entry is an insert, so it always lands whatever
the revision is.

Keep the claim. Release it only if you were told to, with `cn release <id>`.
