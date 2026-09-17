#!/usr/bin/env bash
# SessionStart hook: `cn brief`, the under-20-line situation report (docs/design.md §8).
# It carries state and never doctrine; the rules live in the skill, which loads on demand.
#
# Silent when `cn` is not on PATH and when no deployment is configured, and a failing call
# is swallowed, so a session never fails to start because of this. `matcher: ""` fires it
# after /clear and compaction too, where the state was just lost.
set -eu

command -v cn >/dev/null 2>&1 || exit 0
cn brief 2>/dev/null || exit 0
