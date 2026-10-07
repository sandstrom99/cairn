# Security

A cairn deployment is fenced by one shared secret, so anything that lets someone read or
write a worklist without it, leaks it, or runs a command on a machine through `cn` or the
plugin is a security problem.

Report one privately through
[GitHub's private vulnerability reporting](https://github.com/sandstrom99/cairn/security/advisories/new),
never as a public issue. Include what you ran, what it printed and which commit you were
on. You will hear back within a week.

cairn has no releases yet, so a fix lands on `main`, and an install takes it with
`git pull --ff-only && vp install` from inside `~/.local/share/cairn`, as
[docs/install.md](docs/install.md) says.
