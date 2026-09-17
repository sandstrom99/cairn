# cairn, for Claude Code

@AGENTS.md

## Claude-specific

- `.claude/settings.json` runs `vp fmt --write` on every file Claude writes, so
  formatting never shows up in a diff.
- `.mcp.json` registers Convex's own MCP server against `backend/`, for reading
  tables and logs and running functions while developing. It is a dev tool; the
  agent surface for cairn itself is `cn`.
- `plugins/cairn/` is what other repos install. Do not enable it here until
  `cn brief` exists; its hook is silent without `cn` on PATH anyway.
- Replies name work in the reference form, `app-14 "fix connection retry"`, from
  the first line of the first slice onward.
