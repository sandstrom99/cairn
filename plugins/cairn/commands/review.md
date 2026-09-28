---
description: "Go through an epic with the person: what cn review lists, and what to do about each line."
argument-hint: "<ep-id>"
allowed-tools: Bash(cn:*)
---

The epic is `$ARGUMENTS`.

Run `cn review <ep-id>` and go through it with the person one line at a time, each in the
reference form, saying what the line means and which verb would act on it. Act only when
they say so.

- `near`: two live issues that read as the same work. Ask which survives.
  `cn dep add <b> --duplicates <a>` records the answer and takes the pair off the list;
  `cn drop <id> --revision N --reason "…"` drops one; or both are wanted and nothing changes.
- `inbox`: an item nobody placed. Ask which epic. `cn update <id> --revision N --epic ep-N`,
  or `cn drop` it with a reason.
- `nudge`: a blocker past the day it said to look again. Ask whether it is done. When the
  person says it is done, resolve it on their word, `cn resolve <bl> --note "…" --said
  "<their words>"`; if it is still waited on, say so and leave it.
- `silent`: a claim with nothing for 24 hours. Ask whether that session is still on it. A
  person releases it, `cn release <id>`; nothing releases it on its own.
- `unverified`: a close with no follow-up beside it, from before closes spawned their own.
  `cn create --project <slug> --epic <its epic> --type follow-up --kind verify --parent <id> --title "verify: …"`.
- `edge`: a blocks edge with a finished end. It holds nothing back. Leave it as history, or
  `cn dep rm <id> --blocked-by <other>` if the person wants it gone.
- `can close`: every issue is finished. Run the printed `cn epic close` line when the
  person says to.

End with `cn review <ep-id>` again and say what is left. The review wrote nothing; every
change was a verb, in the log under whoever ran it.
