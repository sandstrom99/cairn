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
src/lib/
  cli.mts        main(), UsageError, say/warn — the shell every verb runs in
  args.mts       the one argument parser
  config.mts     which deployment: CAIRN_URL, then ~/.config/cairn/config.json
  client.mts     the typed Convex client and the generated `api`
  ref.mts        the reference form: id and title, always
```

## Verbs

Only `doctor` exists. The full set, one Convex function per verb or per action word, is
the table in docs/design.md §10; the order they arrive in is docs/dogfood.md.
