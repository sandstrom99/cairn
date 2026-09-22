# The cairn plugin

What an agent gets when cairn is installed: the skill, the session-start situation
report, the one line a session is handed when it stops holding a claim it has not
journaled, and the slash commands. It ships from this repo so it versions with the
`cn` it drives and installs anywhere, including a cloud runner.

```
.claude-plugin/plugin.json   the manifest
skills/cairn/SKILL.md        the language: the reference rule, the verbs, the boundaries
hooks/session-start.sh       `cn brief`, and the session id into CLAUDE_ENV_FILE; two lines with nothing configured, one when the deployment does not answer
hooks/stop.sh                `cn brief --unjournaled` as hook feedback, once per stop; silent when nothing is held quiet
commands/                    /cairn:ready, /cairn:pick, /cairn:handoff, /cairn:close, /cairn:review, /cairn:init
```

## Install on a machine

The repo root is a marketplace (`.claude-plugin/marketplace.json`) that lists this
plugin. Register it once and enable the plugin:

```bash
claude plugin marketplace add ~/code/cairn
claude plugin install cairn@cairn
```

`cn` itself is installed separately; see `packages/cli/README.md`. The hooks do nothing
until `cn` is on PATH.

## What the hooks may and may not do

The SessionStart hook injects state: counts and the top of each queue. It never
carries rules. beads' `bd prime` grew until it contradicted the skill shipped beside it,
and the hook won because a hook always loads. Rules belong in `SKILL.md`, which loads on
demand (docs/design.md §8).

It also writes one line, `export CAIRN_SESSION=<session_id>`, to the file Claude Code
names in `CLAUDE_ENV_FILE` and sources before every Bash command of the session. With
it, every `cn` the session runs carries the session beside the actor: a claim is
idempotent on the two together, so two parallel sessions on one machine cannot both hold
one issue, and the brief marks what this session holds as `yours` (docs/design.md §5).

The Stop hook is the other end of the session. When this session holds a claim with
nothing journaled for longer than the threshold, it hands back `cn brief --unjournaled`,
one line such as `you hold cn-27 "retry on reconnect", last journal 3h ago`, as
`additionalContext`: the turn continues once with that fact in front of the model,
labelled hook feedback rather than a hook error. Plain stdout at Stop never reaches the
model, and `decision: block` reaches it as an error, which a fact is not. It honours
`stop_hook_active`, so it fires once per stop and a line the model chose to leave alone
cannot hold the turn open, and it exits 0 whatever happens. What to do about the line is
the skill's to say.
