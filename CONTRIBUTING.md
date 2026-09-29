# Contributing to cairn

cairn is early. Its shape still changes, and breaking changes are expected. Read
[docs/design.md](docs/design.md) first: it is the design, and every decision in it is a
decision. A change that contradicts it changes the document in the same pull request, or
does not happen.

## Reporting a problem

Open an issue on [sandstrom99/cairn](https://github.com/sandstrom99/cairn/issues). Include:

- what you ran, exactly;
- what it printed, pasted rather than described;
- what `cn doctor` prints, with secrets and deployment URLs trimmed;
- your OS, and what `node --version` and `vp --version` print.

The maintainer tracks accepted work in cairn's own worklist, which is not public, and
links back to the issue from there.

## Proposing a change

Open an issue first for anything bigger than a fix, so the shape is agreed before the
code is written.

A pull request's title is a Conventional Commit, `<type>(<scope>): <subject>`, since a
squash merge makes it the commit that lands on `main`. The types are `feat`, `fix`,
`docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`; the scopes are
`backend`, `cli`, `plugin`, `docs` and `tooling`.

The body says what changed, why, how it was verified, and what is still open. Paste the
evidence: the failing output, the command and what it printed.

## Verifying a change

Once per clone, with `vp` installed as the README's "Install `cn`" says:

```bash
vp install
vp config          # arms the pre-commit hook
```

`vp run verify` is green before anything else: format, lint, types and every test, in
about a second. [AGENTS.md](AGENTS.md)'s "Verify a change" table names the one more
command each kind of change needs. `vp run verify:e2e` needs no deployment of anyone's,
since it runs against a throwaway it starts and stops.

A row that names the cloud deployment `cairn`, or needs a cloud deployment at all, runs
against a deployment of your own, stood up as the README's "Install by hand" says, with
`cairn` read as its name; or the pull request names it as not run, and why.

## Licence

Contributions are made under the MIT licence of the repository, in
[LICENSE](LICENSE).
