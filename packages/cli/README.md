# @cairn/cli

`cn`, the cairn CLI. One verb is one Convex function call plus formatting; the CLI holds
no logic, so an agent reading `cn <verb> --help` is reading the contract of the function
behind it.

## Install on a machine

From a clone of its own, kept at main and never worked in, since every repository's
sessions run the `cn` it holds (the root README's "1. Install `cn`"):

```bash
git clone https://github.com/sandstrom99/cairn ~/.local/share/cairn
cd ~/.local/share/cairn && vp install
ln -s ~/.local/share/cairn/packages/cli/bin/cn ~/.local/bin/cn
cn doctor
```

Nothing is built. `bin/cn` runs `src/main.mts` under Node 24, which strips the types
itself. That is also why every import carries its `.mts` extension and why there are no
enums: the compiler only ever checks, it never emits. A development checkout's own `cn`
is its `packages/cli/bin/cn`, run by path.

## A second machine

The same install, plus `cn init`, because nothing about the deployment is in the
clone:

```bash
git clone https://github.com/sandstrom99/cairn ~/.local/share/cairn
cd ~/.local/share/cairn && vp install
ln -s ~/.local/share/cairn/packages/cli/bin/cn ~/.local/bin/cn
cn init --name cairn --url "$(op read 'op://Personal/cairn dev deployment/url')" \
  --secret-cmd 'op read "op://Personal/cairn dev deployment/secret"'
cn doctor
```

Without 1Password, the secret is a file only this machine reads, saved mode 600, and the
command reads it:

```bash
cn init --name cairn --url https://<deployment>.convex.cloud \
  --secret-cmd 'cat ~/.config/cairn/cairn.secret'
cn doctor
```

`--secret-cmd` is run once,
here, and its stdout is the secret, so the secret is never an argument and never in a
shell history; `cn init` checks that the deployment answers and takes it before writing
anything, and writes the file 600. It adds and never replaces: run against a name the
file already has, it refuses and changes nothing. The one exception is `cn init --refresh`,
which re-runs the secret command stored beside a deployment's secret, as `secretCmd`, and
rewrites that secret once the deployment takes it: how a machine follows a rotation.

The two values to fill in are the deployment's url and its secret, and they live either
in 1Password, as the item `cairn dev deployment` in the Personal vault, fields `url`,
`secret` and `deployment`, or in a file such as `~/.config/cairn/cairn.secret`, which
`node backend/scripts/secret.mjs new` writes on the machine that stands the deployment up
(the root README's "A deployment of your own") and which reaches another machine through
whatever you share secrets with. The secret is the one `CAIRN_SECRET` set on the
deployment, so a machine already logged in to Convex can also read it back with
`npx convex env get CAIRN_SECRET --deployment <deployment>` from `backend/`.

The file `cn init` writes is `~/.config/cairn/config.json`, and it is the copy `cn` reads
on every call — `op` is not on that path, because one read costs seconds:

```json
{
  "default": "cairn",
  "deployments": {
    "cairn": {
      "url": "https://<deployment>.convex.cloud",
      "secret": "…",
      "secretCmd": "op read \"op://Personal/cairn dev deployment/secret\""
    }
  }
}
```

With the file form, `secretCmd` is `"cat ~/.config/cairn/cairn.secret"`.

Editing it by hand is how a deployment that already exists changes, its secret aside,
which is `cn init --refresh`'s. `CAIRN_SECRET` in the shell overrides the file, for a hook
or a one-off run, and `cn init` takes it as the secret when `--secret-cmd` is not given.
Which deployment a call goes to is `CAIRN_URL` when it is set, then the deployment in the
file that `CAIRN_DEPLOYMENT` names, then the file's `default`.

When it works, the last two lines of `cn doctor` are the deployment answering and

```
✓ secret accepted by cairn
```

A wrong or missing secret fails on the same line instead, naming the field to put it in.

## Layout

```
bin/cn           the shim a symlink points at
src/main.mts     dispatch: cn <verb> [args], --help and -h for every verb, --version
src/verbs/       one file per verb, registered in index.mts with its name, summary and spec
src/smoke.test.mts   the real cn under the real Node, every verb's --help; the test
                 that fails on an import without its extension
src/contract.test.mts   the verb contract held in one place: each header's synopsis
                 equals its spec, and the skill, the commands, design §10 and this
                 README name only flags that exist
src/exports.test.mts   every export has an importer, in this package or in apps/web
                 through the exports map; a type kept for a caller that never came fails here
src/lib/
  cli.mts        main(), UsageError, answer, fail, say/warn — the shell every verb runs in
  args.mts       the one argument parser, typed by the spec a verb hands it
  flags.mts      what a flag's value has to be: revision, priority, date, a link, one of a set of words, once;
                 and which positionals a verb takes, onlyId and onlyFlags
  session.mts    what one call is: the config read once, and the deployment and actor from it
  config.mts     which deployment: CAIRN_URL, then CAIRN_DEPLOYMENT, then ~/.config/cairn/config.json's default
  client.mts     the typed Convex client and the generated `api`; connect() is the session with its client
  actor.mts      who cn says is acting: CAIRN_ACTOR, else <host>/<user>, with CAIRN_SESSION beside it
  ping.mts       one projects.list as the proof a deployment answers and takes the secret, for doctor and init
  views.mts      the shapes the lines read: four of the deployment's return types, the rest structural
  time.mts       how long ago, in one token: age, since, day
  parts.mts      the pieces a line is joined from, which the web window sets as rows
  lines.mts      the lines cn prints: a list line, an epic line, the show brief
  run.mts        runs the command `cn close --run` proves with, and keeps its tail
  ref.mts        the reference form: id and title, always
  testing.mts    the fixtures every test builds from, the web's too, through @cairn/cli/testing
```

## Verbs

`cn --help` lists them, one line each, and `cn <verb> --help` (or `-h`) is the verb
file's own header: the contract of the Convex function behind it. The table in
docs/design.md §10 maps each verb, and each action word of `epic`, `project` and `dep`,
to its function. Every read verb takes `--json`, every line naming an issue or epic
starts with the reference form, and a verb takes flags only unless its header names a
positional: `cn ready ios` is refused, since nothing filters the list. Every verb in that
table exists; what to build next is cairn's own worklist, `cn ready`.
