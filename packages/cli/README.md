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
  args.mts       the one argument parser, typed by the spec a verb hands it
  flags.mts      what a flag's value has to be: revision, priority, date, one of a set of words, once
  config.mts     which deployment: CAIRN_URL, then ~/.config/cairn/config.json
  can.mts        what this session can do: --can, then CAIRN_CAN, then the config
  client.mts     the typed Convex client and the generated `api`
  actor.mts      who cn says is acting: CAIRN_ACTOR, else <host>/<user>, with CAIRN_SESSION beside it
  views.mts      the shapes the lines read: four of the deployment's return types, the rest structural
  time.mts       how long ago, in one token: age, since, day
  parts.mts      the pieces a line is joined from, which the web window sets as rows
  lines.mts      the lines cn prints: a list line, an epic line, the show brief
  run.mts        runs the command `cn close --run` proves with, and keeps its tail
  ref.mts        the reference form: id and title, always
```

## Verbs

`cn --help` lists them, one line each, and `cn <verb> --help` is the verb file's own
header: the contract of the Convex function behind it. The table in docs/design.md §10
maps each verb, and each action word of `epic`, `project` and `dep`, to its function.
Every read verb takes `--json`, and every line naming an issue or epic starts with the
reference form. Whether the next verb exists yet is cairn's own worklist: `cn ready`.
