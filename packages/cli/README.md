# @cairn/cli

`cn`, the cairn CLI. One verb is one Convex function call plus formatting; the CLI holds
no logic, so an agent reading `cn <verb> --help` is reading the contract of the function
behind it.

## Install on a machine

```bash
vp install                                         # once per checkout, at the repo root
ln -s ~/code/cairn/packages/cli/bin/cn ~/.local/bin/cn
cn doctor
```

Nothing is built. `bin/cn` runs `src/main.mts` under Node 24, which strips the types
itself. That is also why every import carries its `.mts` extension and why there are no
enums: the compiler only ever checks, it never emits.

## Layout

```
bin/cn           the shim a symlink points at
src/main.mts     dispatch: cn <verb> [args], --help, --version
src/verbs/       one file per verb, registered in index.mts
src/smoke.test.mts   the real cn under the real Node, every verb's --help; the test
                 that fails on an import without its extension
src/lib/
  cli.mts        main(), UsageError, say/warn — the shell every verb runs in
  args.mts       the one argument parser
  config.mts     which deployment: CAIRN_URL, then ~/.config/cairn/config.json
  can.mts        what this session can do: --can, then CAIRN_CAN, then the config
  client.mts     the typed Convex client and the generated `api`
  actor.mts      who cn says is acting: CAIRN_ACTOR, else <host>/<user>
  format.mts     the lines cn prints: a list line, an epic line, the show brief
  run.mts        runs the command `cn close --run` proves with, and keeps its tail
  ref.mts        the reference form: id and title, always
```

## Verbs

What exists today. Every read verb takes `--json`, every line naming an issue or epic
starts with the reference form, and `cn <verb> --help` is the verb file's own header.

```
cn create --project <slug> --epic <ep-id> --title <title> [--priority 0-4] …
cn list [--project] [--epic] [--status] [--mine] [--json]
cn ready [--can ios web …] [--json]      open, unblocked, in priority order, marked
cn show <id> [--history] [--json]        an issue, an epic or a blocker, by prefix
cn claim <id>  ·  cn release <id>        first writer wins, no lease
cn update <id> --revision N [--title] [--priority] [--epic] [--defer-until] [--requires]
cn journal <id> --kind finding|decision|handoff|evidence|question <body…>
cn close <id> --revision N --run '<cmd>' | --unverified <why> [--follow-up <title> --kind verify]
cn drop <id> --revision N --reason <text>
cn dep add|rm <id> --blocked-by|--blocks|--related|--discovered-from|--duplicates|--supersedes <other>
cn wait <id> --kind approval|external-wait|decision|credential|purchase --owner <who>
             --title <what> --resolves <what ends it> [--nudge <date>]  ·  cn wait <id> --on bl-3
cn waiting [--json]                      every unresolved blocker, and what it holds
cn ack <bl-id>                           a person saying seen: raised → waiting
cn resolve <bl-id> --note <what happened>   ends it, and frees every issue it holds
cn epic new <title> [--description]  ·  cn epic list [--all] [--json]
cn project new <slug> --name <name>  ·  cn project list [--json]
cn doctor                                node, the generated api, the deployment
```

The rest — `brief` and `reconcile` — is the table in
docs/design.md §10, one Convex function per verb or per action word. The order they
arrive in is cairn's own worklist: `cn ready`.
