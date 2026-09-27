---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:cairn:)?(?:cairn|ready)"'
min: 1
---

The rule reaches a session only through the skill or the `/cairn:ready` command, so "What's next?" has to fire one of them.
