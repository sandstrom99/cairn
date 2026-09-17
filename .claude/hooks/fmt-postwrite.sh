#!/usr/bin/env bash
# Claude PostToolUse hook (matcher: Write|Edit): format the written file with oxfmt
# through `vp fmt`, so a diff never carries formatting noise. Reads the tool input JSON
# from stdin for the path. Benign when vp is absent or the file is not one it formats.
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ] || exit 0

case "$FILE_PATH" in
  *.ts | *.mts | *.tsx | *.js | *.mjs | *.cjs | *.json | *.jsonc) ;;
  *) exit 0 ;;
esac
case "$FILE_PATH" in
  */convex/_generated/* | */node_modules/*) exit 0 ;;
esac

command -v vp >/dev/null 2>&1 || exit 0
ROOT="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$FILE_PATH")" rev-parse --show-toplevel 2>/dev/null || pwd)}"
(cd "$ROOT" && vp fmt "$FILE_PATH" --write) >/dev/null 2>&1 || true
