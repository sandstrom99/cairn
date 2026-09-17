# The cairn plugin

What an agent gets when cairn is installed: the skill, the session-start situation
report, and later the slash commands. It ships from this repo so it versions with the
`cn` it drives and installs anywhere, including a cloud runner.

```
.claude-plugin/plugin.json   the manifest
skills/cairn/SKILL.md        the language: the reference rule, the verbs, the boundaries
hooks/session-start.sh       `cn brief`, silent until it exists
commands/                    slash commands, none yet
```

## Install on a machine

The repo root is a marketplace (`.claude-plugin/marketplace.json`) that lists this
plugin. Register it once and enable the plugin:

```bash
claude plugin marketplace add ~/code/cairn
claude plugin install cairn@cairn
```

`cn` itself is installed separately; see `packages/cli/README.md`. The hook does nothing
until `cn` is on PATH.

## What the hook may and may not do

The SessionStart hook injects state: counts and the top of each queue. It never
carries rules. beads' `bd prime` grew until it contradicted the skill shipped beside it,
and the hook won because a hook always loads. Rules belong in `SKILL.md`, which loads on
demand (docs/design.md §8).
