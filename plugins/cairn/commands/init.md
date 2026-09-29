---
description: "Set cairn up on this machine: find the deployment, ask what only the person knows, write the config."
argument-hint: "[deployment url]"
allowed-tools: Bash(cn:*)
---

Run `cn doctor` first. If it already names a deployment that answers, this machine is set
up: say which deployment and stop.

The url is `$ARGUMENTS` when that is given; otherwise look for a cairn deployment URL in
this repository's `CLAUDE.md`, `AGENTS.md` or `README`, and ask the person only if it is
nowhere. The name is a short lowercase word for whose worklist it is, usually the company
or the repository. When `CAIRN_DEPLOYMENT` is set, this repository has already named it:
that is the name, and it stays out of `--default`, so the machine's default is left where
it is.

Then ask, in one round, only what cannot be found: the command that prints the
deployment's secret — `op read "op://<vault>/<item>/secret"` is the usual shape — or that
the deployment has none. Ask for the command, never for the secret itself, and do not run
it: `cn init` runs it once and never prints what it printed. Ask in the same round what
this machine can do, offering what you can see: `xcodebuild` is `ios`, an Android SDK or
`adb` is `android`, a browser or a node toolchain is `web`, an attached phone is `device`.
`decision` is a person's capability and never a machine's, so it is not one of the answers.

Then `cn init --name <name> --url <url> --secret-cmd '<command>' --can <cap>…`, then
`cn doctor`, then `cn brief`, and show the person the brief.

A refused secret or a deployment that does not answer writes nothing at all, so fix the
input and run the same command again. A secret that worked and is now refused means the
deployment's secret was rotated: run `cn init --refresh`, not a new `cn init`, and it
re-runs the command this machine stored and rewrites that one secret. A name that is
taken means this machine is already set up for that deployment: read `cn doctor` before
anything else. Never edit the config file by hand to get past a check that failed.
