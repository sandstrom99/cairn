#!/usr/bin/env bash
# Stop hook: the one state line a session is handed when it tries to end a turn holding a
# claim with nothing journaled past the threshold (docs/design.md §8), and nothing else:
#
#   you hold cn-27 "retry on reconnect", last journal 3h ago
#
# It is `cn brief --unjournaled`, verbatim, a verb that reads only what this session
# holds, since it runs at the end of every turn. It goes back as `additionalContext` so
# the turn continues once with the line in front of the model, labelled hook feedback
# rather than a hook error. Plain stdout would not do: at Stop, Claude Code writes it to
# the debug log and never to the model; only SessionStart and the prompt hooks add
# stdout as context. `decision: block` reaches the model too, but as an error, and a fact
# is not one.
#
# Once per stop: Claude Code sets stop_hook_active when it is already continuing because
# of a stop hook, and the hook is silent then, so a line the model chose to leave alone
# cannot hold the turn open. Exit 0 always, and silent whenever `cn` is missing, the
# deployment does not answer, or nothing is held quiet: a session never fails to end
# because of this. State, never doctrine: what to do about the line is the skill's.
#
# The session comes from stdin's session_id, read as the SessionStart hook reads it,
# because a hook does not source CLAUDE_ENV_FILE; without a session cn holds nothing and
# prints nothing. node builds the JSON, and it is on PATH wherever `cn` just ran, so a
# title's quotes and backslashes are escaped by a real encoder rather than by sed.
set -eu

# stdin is the hook's JSON when Claude Code runs it, and a terminal when a person does.
input=""
if [ ! -t 0 ]; then input=$(cat 2>/dev/null || true); fi
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi
session=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([A-Za-z0-9._-]*\)".*/\1/p' | head -n 1)
if [ -n "$session" ]; then
  export CAIRN_SESSION="$session"
fi

command -v cn >/dev/null 2>&1 || exit 0
line=$(cn brief --unjournaled 2>/dev/null) || exit 0
[ -n "$line" ] || exit 0
node -e '
  const additionalContext = process.argv[1];
  const out = { hookSpecificOutput: { hookEventName: "Stop", additionalContext } };
  process.stdout.write(`${JSON.stringify(out)}\n`);
' "$line" 2>/dev/null || exit 0
exit 0
