#!/usr/bin/env bash
# Claude Stop hook: a session may not end its turn with code that fails `vp check`.
#
# Runs `vp check` over the files this session changed (unstaged, staged and untracked),
# code files only. Clean, or nothing changed: silent, exit 0. Dirty: exit 2, which hands
# the output back to Claude as the reason it has to keep going, once. Claude Code sets
# stop_hook_active on the retry so a check that cannot pass does not loop forever.
#
# About a second on a handful of files. Tests are not run here: `vp run verify` is the
# session's own job and CI's gate, and a red test can be a legitimate place to stop and
# ask. A formatting or lint or type error never is.
set -euo pipefail

INPUT=$(cat)
if printf '%s' "$INPUT" | jq -e '.stop_hook_active == true' >/dev/null 2>&1; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0
command -v vp >/dev/null 2>&1 || exit 0

CHANGED=$( { git diff --name-only; git diff --name-only --cached; git ls-files --others --exclude-standard; } 2>/dev/null \
  | sort -u \
  | grep -E '\.(ts|mts|tsx|js|mjs|cjs|json|jsonc)$' \
  | grep -v -E '(^|/)convex/_generated/' \
  | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done || true)
[ -z "$CHANGED" ] && exit 0

FILES=()
while IFS= read -r f; do FILES+=("$f"); done <<< "$CHANGED"

if OUT=$(vp check "${FILES[@]}" 2>&1); then
  exit 0
fi

{
  echo "vp check fails on files this session changed. Fix before stopping:"
  echo
  echo "$OUT" | sed 's/\x1b\[[0-9;]*m//g' | tail -40
  echo
  echo "  vp check --fix ${FILES[*]}    # formatting fixes itself; lint and type errors do not"
  echo "  vp run verify                 # then the whole gate: check plus every test"
} >&2
exit 2
