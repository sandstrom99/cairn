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

## A second machine

The same two steps, plus `cn init`, because nothing about the deployment is in the
checkout:

```bash
vp install                                         # once per checkout, at the repo root
ln -s ~/code/cairn/packages/cli/bin/cn ~/.local/bin/cn
cn init --name cairn --url "$(op read 'op://Personal/cairn dev deployment/url')" \
  --secret-cmd 'op read "op://Personal/cairn dev deployment/secret"' \
  --can web android
cn doctor
```

`--can` is what this machine can do, not what it must be. `--secret-cmd` is run once,
here, and its stdout is the secret, so the secret is never an argument and never in a
shell history; `cn init` checks that the deployment answers and takes it before writing
anything, and writes the file 600. It adds and never replaces: run against a name the
file already has, it refuses and changes nothing.

The two values to fill in are the deployment's url and its secret, and 1Password is where
both live: the item `cairn dev deployment` in the Personal vault, fields `url`, `secret`
and `deployment`. The secret is the one `CAIRN_SECRET` set on the deployment, so a machine
already logged in to Convex can also read it back with
`npx convex env get CAIRN_SECRET --deployment <deployment>` from `backend/`.

The file `cn init` writes is `~/.config/cairn/config.json`, and it is the copy `cn` reads
on every call — `op` is not on that path, because one read costs seconds:

```json
{
  "default": "cairn",
  "can": ["web", "android"],
  "deployments": {
    "cairn": { "url": "https://<deployment>.convex.cloud", "secret": "…" }
  }
}
```

Editing it by hand is how a deployment that already exists changes. `CAIRN_SECRET` in the
shell overrides the file, for a hook or a one-off run, and `cn init` takes it as the
secret when `--secret-cmd` is not given.

When it works, the last two lines of `cn doctor` are the deployment answering and

```
✓ secret accepted by cairn
```

A wrong or missing secret fails on the same line instead, naming the field to put it in.

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
cn brief [--can ios web …] [--json]      counts and the head of each queue, under 20 lines
cn create --project <slug> --epic <ep-id> --title <title> [--priority 0-4] …
cn list [--project] [--epic] [--status] [--mine] [--json]
cn ready [--can ios web …] [--json]      open, unblocked, in priority order, marked
cn show <id> [--history] [--json]        an issue, an epic or a blocker, by prefix
cn log [--limit N] [--before <date>] [--json]   what happened across the deployment, newest first
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

The rest — `reconcile` — is the table in docs/design.md §10, one Convex function per
verb or per action word. The order they arrive in is cairn's own worklist: `cn ready`.
