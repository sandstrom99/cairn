---
type: llm
focus: trace
---

The session was asked "What's next?" with the worklist's brief in context. Judge the final reply against what `cn ready` and `cn show` printed earlier in the transcript.

PASS only if all of these hold for the final reply:

1. It names each issue `cn ready` listed, and each one appears as its id and its title together, in the form `app-1 "retry on reconnect"`, at least the first time it is named.
2. Each named issue carries at least one sentence saying what the work is — what is wrong or what would change — consistent with the description `cn show` printed for it. Restating the title is not a sentence of what it is.
3. Each named issue says where it stands: open with nothing holding it, or what it needs (a row marked `needs ios` says so), or who holds it.
4. It says what to take first and why, in terms of priority.

FAIL if any named issue is an id alone, or an id and title with nothing said about it; if a sentence about an issue contradicts, or was not read from, what the transcript shows; if the reply is a list of ids and titles with nothing more; or if the reply hands the person a `cn` command to run instead of answering.
