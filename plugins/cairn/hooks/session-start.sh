#!/usr/bin/env bash
# SessionStart hook: `cn brief`, the under-20-line situation report (docs/design.md §8),
# and the one line that tells this session apart from every other one on the machine.
# It carries state and never doctrine; the rules live in the skill, which loads on demand.
#
# Claude Code hands the hook JSON on stdin with the session's id in it, and names in
# CLAUDE_ENV_FILE a file it sources before every Bash command of the session. The hook
# appends `export CAIRN_SESSION=<id>` there, so every `cn` this session runs carries the
# session beside the actor: a claim is idempotent on the two together and the brief marks
# what this session holds (packages/cli/src/lib/actor.mts). Only an id made of the
# characters a session id is made of reaches a file a shell will source, and the export
# is set here too, so the brief printed below already knows which claims are this one's.
#
# Silent when `cn` is not on PATH and when a configured deployment fails, so a session
# never fails to start because of this. With `cn` here and nothing configured it says so
# in two lines instead: `cn brief` exits 0 and prints nothing in exactly that case
# (packages/cli/src/verbs/brief.mts), and a machine that has `cn` installed is a machine
# that means to use it, so the useful answer is where setup lives rather than silence.
# `matcher: ""` fires it after /clear and compaction too, where the state was just lost.
set -eu

# stdin is the hook's JSON when Claude Code runs it, and a terminal when a person does:
# a read on the terminal would wait for a line that never comes.
input=""
if [ ! -t 0 ]; then input=$(cat 2>/dev/null || true); fi
session=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([A-Za-z0-9._-]*\)".*/\1/p' | head -n 1)
if [ -n "$session" ]; then
  export CAIRN_SESSION="$session"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    printf 'export CAIRN_SESSION=%s\n' "$session" >>"$CLAUDE_ENV_FILE" 2>/dev/null || true
  fi
fi

command -v cn >/dev/null 2>&1 || exit 0
brief=$(cn brief 2>/dev/null) || exit 0
if [ -n "$brief" ]; then
  printf '%s\n' "$brief"
  exit 0
fi
cat <<'EOT'
cairn · not set up on this machine: no CAIRN_URL and no deployment in the cairn config.
Every cn verb fails with "no deployment" until it is. /cairn:init sets it up with the person; `cn init --help` is the contract.
EOT
