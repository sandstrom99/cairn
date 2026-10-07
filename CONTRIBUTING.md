# Contributing to cairn

cairn is early. Its shape still changes, and breaking changes are expected. Read
[docs/design.md](docs/design.md) first: it is the design, and every decision in it is a
decision. A change that contradicts it changes the document in the same pull request, or
does not happen.

## Reporting a problem

Open an issue on [sandstrom99/cairn](https://github.com/sandstrom99/cairn/issues/new/choose),
whose form asks for:

- what you ran, exactly;
- what it printed, pasted rather than described;
- what `cn doctor` prints, with secrets and deployment URLs trimmed;
- your OS, and what `node --version` and `vp --version` print.

The maintainer tracks accepted work in cairn's own worklist, which is not public, and
links back to the issue from there.

A security problem goes privately instead, as [SECURITY.md](SECURITY.md) says.

## Proposing a change

Propose a change as an issue: what you want to be true, and why. Pull requests are open
to collaborators only while cairn is this early, since its shape still changes and every
change goes through `docs/design.md` and the verification table in `AGENTS.md`. When a
proposal is taken on, the maintainer makes the change or invites you to make it.

For a collaborator, a pull request's title is a Conventional Commit, `<type>(<scope>): <subject>`, since a
squash merge makes it the commit that lands on `main`. The types are `feat`, `fix`,
`docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`; the scopes are
`backend`, `cli`, `plugin`, `docs` and `tooling`.

The body says what changed, why, how it was verified, and what is still open. Paste the
evidence: the failing output, the command and what it printed.

## Working on cairn's own worklist

A collaborator may also be joined to the worklist cairn is built from, the deployment
`cairn`. The maintainer hands over its URL and its secret, and you join from the
README's "Joining a worklist that exists", which installs `cn` and the plugin and sets
your machine up. Work then happens in a development clone of your own, set up as
"Verifying a change" below says, and never in the install at `~/.local/share/cairn`, as
[AGENTS.md](AGENTS.md)'s "Where work happens" says.

A Claude Code session in that clone opens on `cairn · cairn`, the worklist's brief, and
works the maintainer's own loop, AGENTS.md's "Dogfood":

- the issue you name, or the top of `cn ready`, is claimed before anything is touched;
- what the session finds goes on the issue as it goes, as journal entries;
- the pull request links back to the issue, and the issue closes with its proof once
  the pull request merges;
- a problem found along the way that is not the issue at hand is filed in cairn with
  `cn create`, not as a GitHub issue.

You ask for these in plain words, "what's next?" or "pick up cn-40", and the session
runs the commands.

## Verifying a change

Once per clone, with `vp` installed as [docs/install.md](docs/install.md)'s "1. Install `cn`" says:

```bash
vp install
vp config          # arms the pre-commit hook
```

`vp run verify` is green before anything else: format, lint, types and every test, in
about a second. [AGENTS.md](AGENTS.md)'s "Verify a change" table names the one more
command each kind of change needs. `vp run verify:e2e` needs no deployment of anyone's,
since it runs against a throwaway it starts and stops.

A row that names the cloud deployment `cairn`, or needs a cloud deployment at all, runs
against a deployment of your own, stood up as [docs/install.md](docs/install.md) says, with
`cairn` read as its name; or the pull request names it as not run, and why.

## Licence

Contributions are made under the MIT licence of the repository, in
[LICENSE](LICENSE).
