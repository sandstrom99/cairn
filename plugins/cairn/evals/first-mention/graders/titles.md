---
type: regex
pattern: '\b(?:app|ep|bl)-\d+\b(?!\s*["“])'
match: not_contains
target: last_message
---

The floor: every id in the final reply is followed by its title in quotes, the reference form `app-1 "retry on reconnect"`. One bare `app-1` fails the case. The final reply only: a bare id inside a `cn show app-1` the session ran is not a slip.
