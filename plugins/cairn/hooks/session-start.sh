#!/usr/bin/env bash
# SessionStart hook: `cn brief`, the under-20-line situation report (docs/design.md §8).
# It carries state and never doctrine; the rules live in the skill, which loads on demand.
#
# Silent when `cn` is not on PATH and when a configured deployment fails, so a session
# never fails to start because of this. With `cn` here and nothing configured it says so
# in two lines instead: `cn brief` exits 0 and prints nothing in exactly that case
# (packages/cli/src/verbs/brief.mts), and a machine that has `cn` installed is a machine
# that means to use it, so the useful answer is where setup lives rather than silence.
# `matcher: ""` fires it after /clear and compaction too, where the state was just lost.
set -eu

command -v cn >/dev/null 2>&1 || exit 0
brief=$(cn brief 2>/dev/null) || exit 0
if [ -n "$brief" ]; then
  printf '%s\n' "$brief"
  exit 0
fi
cat <<'EOF'
cairn · not set up on this machine: no CAIRN_URL and no deployment in the cairn config.
Every cn verb fails with "no deployment" until it is. /cairn:init sets it up with the person; `cn init --help` is the contract.
EOF
