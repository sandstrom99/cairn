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
# Silent when `cn` is not on PATH, so a session never fails to start because of this.
# With `cn` here it prints one of four states, exit 0 every way. The brief, when the
# deployment answers. With nothing configured, two lines saying so and where setup lives:
# `cn brief` exits 0 and prints nothing in exactly that case
# (packages/cli/src/verbs/brief.mts), and a machine that has `cn` installed is a machine
# that means to use it. When a deployment is configured but does not answer, or refuses
# the secret, one line naming it and `cn doctor`, which says why; without it a dead or
# misconfigured deployment looked exactly like nothing installed. The name is the one
# `cn doctor` resolves, read from its `deployment <name> → <url>` line. And when the
# config does not resolve at all, such as a CAIRN_DEPLOYMENT this machine has not set up,
# `cairn: <cn's one line>`, the line cn fails with, since no deployment was reached and
# "did not answer" would send the reader to the wrong place. The 5 s
# timeout in plugin.json bounds a black-holed URL: a `cn brief` that hangs is cut off
# there, and the session starts with nothing rather than late.
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
if brief=$(cn brief 2>/dev/null); then
  if [ -n "$brief" ]; then
    printf '%s\n' "$brief"
    exit 0
  fi
  cat <<'EOT'
cairn · not set up on this machine: no CAIRN_URL and no deployment in the cairn config.
Every cn verb fails with "no deployment" until it is. /cairn:init sets it up with the person; `cn init --help` is the contract.
EOT
  exit 0
fi
# The call failed. `cn doctor` resolves the same deployment and prints its name, never the
# secret, and its own ping is the diagnosis the line points at. When it prints no
# `deployment <name> →` line, nothing resolved: the config itself is wrong — a
# CAIRN_DEPLOYMENT this machine has not set up, a default naming nothing — and cn doctor
# fails with the one line that says so, which is the line to hand on.
report=$(cn doctor 2>&1 || true)
name=$(printf '%s\n' "$report" | sed -n 's/^[^ ]* deployment \([^ ]*\) → .*/\1/p' | head -n 1)
if [ -n "$name" ]; then
  printf 'cairn: %s did not answer; cn doctor says why\n' "$name"
  exit 0
fi
problem=$(printf '%s\n' "$report" | sed -n 's/^✗ //p' | head -n 1)
printf 'cairn: %s\n' "${problem:-the configured deployment did not answer; cn doctor says why}"
exit 0
