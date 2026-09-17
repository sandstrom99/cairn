# cairn, for Claude Code

@AGENTS.md

## Claude-specific

- **`vp run verify` before you report anything as working.** It is one second.
- `.claude/settings.json` runs two hooks: `vp fmt --write` on every file Claude
  writes, and on Stop, `vp check` over the files this session changed. A failing
  check hands its output back and the turn continues; that is the gate in
  **Verify a change** above, enforced.
- `.mcp.json` registers Convex's own MCP server against `backend/`, for reading
  tables and logs and running functions while developing. It is a dev tool; the
  agent surface for cairn itself is `cn`.
- `plugins/cairn/` is enabled here through `.claude/settings.json`, so every
  session in this repo starts with `cn brief` in context when a deployment is
  configured, and the skill and the `/cairn:*` commands are the ones other repos
  get.
- Replies name work in the reference form, `app-14 "fix connection retry"`, from
  the first line of the first slice onward.
