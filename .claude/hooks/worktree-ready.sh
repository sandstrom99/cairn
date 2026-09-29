#!/usr/bin/env bash
# Claude SessionStart hook: a new worktree of cairn comes up ready to work in.
#
# A worktree is a fresh working tree, so everything gitignored is missing from it:
# node_modules, which `vp run verify` and the other two hooks need, and in a clone whose
# core.hooksPath is relative, the `.vite-hooks/_` the pre-commit gate runs from. Without
# the second, git skips the gate without a word. `claude -w` rewrites a relative hooks
# path to the main checkout's absolute one; the desktop app's worktrees do not.
#
# Silent when both are there, which is every session but a new worktree's first, and then
# it costs a stat. Otherwise `vp install` (about two seconds from the pnpm store) and
# `vp config`, and one line saying what it did. Never fails the session.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0
command -v vp >/dev/null 2>&1 || exit 0

did=""
if [ ! -d node_modules ]; then
  if ! vp install >/dev/null 2>&1; then
    echo "cairn: vp install failed in $PWD; run it before vp run verify"
    exit 0
  fi
  did="installed node_modules"
fi

hooks=$(git config core.hooksPath 2>/dev/null || true)
if [ -z "$hooks" ] || [ ! -e "$hooks/pre-commit" ]; then
  vp config >/dev/null 2>&1 && did="${did:+$did and }armed the pre-commit hook"
fi

[ -n "$did" ] && echo "cairn: a new worktree, so this session $did"
exit 0
