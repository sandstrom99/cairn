# The cairn plugin

What an agent gets when cairn is installed: the skill, the session-start situation
report, and the slash commands. It ships from this repo so it versions with the
`cn` it drives and installs anywhere, including a cloud runner.

```
.claude-plugin/plugin.json   the manifest
skills/cairn/SKILL.md        the language: the reference rule, the verbs, the boundaries
hooks/session-start.sh       `cn brief`, and the session id into CLAUDE_ENV_FILE; silent without a deployment
commands/                    /cairn:ready, /cairn:pick, /cairn:handoff, /cairn:close
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

It also writes one line, `export CAIRN_SESSION=<session_id>`, to the file Claude Code
names in `CLAUDE_ENV_FILE` and sources before every Bash command of the session. With
it, every `cn` the session runs carries the session beside the actor: a claim is
idempotent on the two together, so two parallel sessions on one machine cannot both hold
one issue, and the brief marks what this session holds as `yours` (docs/design.md §5).
