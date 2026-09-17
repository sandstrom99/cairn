#!/usr/bin/env bash
# SessionStart hook: the under-20-line situation report (docs/design.md §8). It carries
# state and never doctrine; the rules live in the skill, which loads on demand.
#
# Silent until `cn brief` exists and a deployment is configured, so enabling the plugin
# before the first slice lands costs a session nothing.
set -eu

command -v cn >/dev/null 2>&1 || exit 0
cn brief 2>/dev/null || exit 0
