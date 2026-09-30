---
name: cairn
description: >
  The agent worklist. Use for any work that spans sessions, machines or agents: what is
  ready, what is in progress, what is waiting on a human, what a task is and what happened
  to it. Trigger on "what's next", "what's ready", "track this", "pick up where we left
  off", "what is app-14", "close this", "log a finding". Also trigger, unprompted, on a sentence that
  names an issue, epic or blocker in the reference form and asks what it is about, where
  it stands, why it is quiet, what it is waiting on, whether it is still worth doing, what should happen
  next, or for help deciding: load this skill before answering, since it says what to read
  and the shape the answer takes.
  Everything goes through the `cn` CLI.
allowed-tools: "Bash(cn:*)"
version: "0.1.0"
---

# cairn

The worklist every agent and every machine shares, held on one Convex deployment and
driven entirely through the `cn` CLI. With a deployment configured, this session opened
with `cn brief` in its context: the counts, what is ready, what is in progress and who
holds it. That is state — everything below is how to act on it. On a machine where the
session opened instead with "not set up on this machine", run `/cairn:init` before
anything else: no verb below can work until the config exists. When the person asks to
put a company or a repository on cairn, a worklist for a company that has none or a
repository whose sessions should open on one, that is `/cairn:init` too: it stands the
deployment up, sets the machine up and wires the repository, and asks the person only to
name things. Where it opened with
"cairn: CAIRN_DEPLOYMENT is <name>, and this machine has no …", this repository names a
deployment the machine has not joined: run `/cairn:init`, which sets up exactly that one.
Where it opened with "cairn: <name> did not answer; cn doctor says why", a deployment is configured and the
call to it failed: run `cn doctor` and read its last line before any verb. When it names
`cn init --refresh`, run that yourself: it re-runs the command this machine already
stores, prints no secret and asks nothing of the person. If that command fails because
the password manager is locked, which 1Password says as `account is not signed in` or as
`authorization timeout`, unlocking it is the one thing to hand the person. Anything
else about the URL or the secret is theirs, since neither is yours to change. When
doctor's last line, or a verb that failed, names `#push:cloud`, the deployment runs other
functions than this `cn`: pushing a company's deployment is the person's, so say that to
them rather than running it.

## How work is named in a reply

Two rules. The first is the floor and must not slip; the second is what lets a reply
stand on its own, without the page.

**Work is named in the reference form**, id and title together:

```
app-14 "fix connection retry"
```

In every journal entry, commit message and handoff, on every `cn` line, and the first
time a reply names it. A bare `app-14` there is a bug: the reader has nothing to hold on
to, and a session's worth of "working on wu03.2" is unreadable a day later. Later in the
same reply, with the form in sight above it, `after app-14` reads fine. Every `cn` list
line starts with this form; copy it, do not shorten it.

**The first time a reply names an issue or epic in a session, it says what it is.** A
title is a handle, not an explanation: `app-14 "fix connection retry"` tells the person
nothing about what doing it would mean or why it is next. So a first mention is the
reference form, then a sentence of what the work is and where it stands — open, held by
whom and since when, blocked by what, needing what — read from `cn show <id>` before the
reply, never invented. An answer to "what is next" says why each one is next: its
priority, that nothing holds it, what it needs that this session has. Named again later
in the same session, the reference form alone is enough; the person has just read what
it is. After compaction or `/clear`, every issue is a first mention again: the brief
came back with the session, and the explanation has to come back with it. A `cn show`
costs one call; a reply the person has to open the page to understand costs more.

The bare list, which is the reply to avoid:

> Ready: app-31, then app-40. app-31 is P1.

The same reply, with each issue said once:

> Two are ready. **app-31 "retry on reconnect"** is first, P1: the app drops its socket
> on a network change and never reconnects, so the person sees a spinner until they
> restart it. It is open, nothing holds it, and this session can do it.
> **app-40 "invite landing copy"** is P2 and open: the invite page still reads as a
> placeholder. It needs a screenshot from a phone, and this machine has no device, so it
> is next for a session with iOS.

## What cairn is for

| Use `cn` when | Not `cn` |
|---|---|
| The work outlives this session | A checklist for the next twenty minutes |
| Another agent or machine may pick it up | A note to yourself in this conversation |
| It blocks on a human, a device, a decision | Something you can finish now |
| A finding or a decision must survive compaction | The reasoning that led to it |

Tasks only. Not a wiki, not a knowledge base. A finding is a journal entry; a decision is
an issue.

## The verbs

| Verb | Does | Backed by |
|---|---|---|
| `cn brief` | the session-start report, under 20 lines | `brief.get` |
| `cn ready` | what can be started, by priority | `ready.list` |
| `cn list` | issues by project, epic, status, or `--mine`; `--silent 3d` for what nobody has touched, `--blocked` for what a live edge holds | `issues.list` |
| `cn search <text>` | the issues whose title, description, a link's URL or label, or a journal entry holds the text, across every status, each marked with the field; run before `cn create` | `search.find` |
| `cn show <id> [--history]` | the brief: reference, epic, status, who, since when, neighbours, journal | `show.get` |
| `cn log [--limit N]` | what happened across the deployment, newest first: who claimed, closed or raised what | `events.recent` |
| `cn create` | a new issue; `--epic` is required and the verb offers candidates; a near-identical open title in the epic is printed under the line; `--link <url>` or `--link '[label](url)'` puts a link on it, and repeats | `issues.create` |
| `cn claim <id>` · `cn release <id>` | atomic, first writer wins, no lease; release refuses nobody, so another's claim is left alone by judgement | `issues.claim` · `issues.release` |
| `cn update <id> --revision N` | title, description, design, acceptance, priority, epic, defer; `--link` adds a link or relabels one, `--unlink <url>` takes one off. The id says what changes: an epic takes its title, description and links, a blocker its title, `--resolves` and links, and a flag the thing has no field for is refused | `issues.update` · `epics.update` · `blockers.update` |
| `cn journal <id> --kind …` | append a `finding`, `decision`, `handoff`, `evidence` or `question` | `journal.append` |
| `cn close <id> --revision N --run '<cmd>'` | runs the command and records it, or `--unverified <why>`; `--follow-up` spawns the residue; an `--unverified` close with no `--follow-up` gets a verify follow-up spawned beside it, and the close of an epic's last issue prints the `cn epic close` line; each open issue the close was the last thing holding is printed under it as a `ready` line, the next thing to pick without another `cn ready` | `issues.close` |
| `cn drop <id> --revision N --reason …` | closed without doing, never silently | `issues.drop` |
| `cn dep add\|rm <id> --blocked-by <id>` | the graph; also `--blocks`, `--related`, `--discovered-from`, `--duplicates`, `--supersedes` | `edges.add` · `edges.remove` |
| `cn wait <id> --kind … --owner … --title … --resolves …` | raise a human blocker, or `--on bl-3` to attach one that exists; `--link` puts a link on a new one | `blockers.raise` |
| `cn waiting` | what is blocked on a human | `blockers.list` |
| `cn ack <bl> [--said …]` · `cn resolve <bl> --note … [--said …]` | the person's own, or an agent's on their word | `blockers.ack` · `blockers.resolve` |
| `cn epic new\|list\|close` · `cn project new\|list\|update` | the containers; `epic new --link` puts a link on the new epic, `epic list` and `project list` print a health block each, `project update` changes a project's name, description and links against a revision, `epic close` is refused while a task is open | `epics.*` · `projects.*` |
| `cn review <epic>` | what to look at in an epic, one line each: near-identical titles, inbox items past 7 days, blockers past their nudge date, silent claims, unverified closes with no follow-up, blocks edges with one end finished and one still live, and whether it can close. Writes nothing | `review.get` |
| `cn doctor` | node, the generated api, whether the deployment answers | `projects.list` |
| `cn init --name … --url … [--secret-cmd …]` · `cn init --refresh [--name …]` | sets a machine up: writes the config, after checking the deployment answers and takes the secret; `--refresh` takes a rotated secret by re-running the stored command | `projects.list`, as the check |

Every read verb takes `--json`. Every write to a mutable field carries the revision that
was read; a stale write comes back with what changed and who changed it, and the right
move is to re-read and decide, never to force. `cn <verb> --help` is that verb's
contract, in full. A verb takes flags only unless its contract names a positional, and
refuses one it does not: `cn ready ios` is a usage error, since nothing filters the list.

## A session's shape

- **Start.** The brief is already above. `cn ready` for the whole list, `cn show <id>`
  for the one that looks right, `cn claim <id>` before touching anything.
- **During.** `cn journal <id> --kind finding` or `--kind decision` the moment something
  would be lost to compaction. `cn wait <id>` the moment the work needs a person.
  `cn dep add <id> --blocked-by <other>` when one thing turns out to block another.
  When the work leaves something behind that someone will want to find again, put it on
  the issue as a link: `cn update <id> --revision N --link '[label](url)'`. An epic's plan
  doc and a decision blocker's options go on the epic and the blocker the same way.
  `cn search <text>` before `cn create`: what you are about to file may already be there,
  open or closed, and then the answer is that issue, not a second one. `--project` on
  `cn create` is the project the repository's `## cairn` section, in its `CLAUDE.md` or
  `CLAUDE.local.md`, gives for the part the work touches. The brief's `projects` line
  names every project the deployment has; the section names only the ones this repository
  maps. When the work fits none of the section's rows, or there is no section,
  `cn project list` says what each project is, and ask the person when more than one
  could fit. Where the section says new work goes to another tracker, file it there, not
  with `cn create`.
- **End.** `cn journal <id> --kind handoff` saying where it stands, what is unverified and
  what is next. Then `cn close <id> --revision N --run '<cmd>'` when it is done, or
  `cn release <id>` when it is not, so the next session can take it.
- **Someone else's claim.** Leave it, and say who holds it and since when. Nothing
  refuses releasing, closing or dropping it, so the judgement is yours: do it only when
  the person asks, or when it is plainly this work's own claim under an old name, as
  after a machine was renamed mid-session. Journal why on the issue first, with the
  person's words when they asked.
- **With the person.** `/cairn:review <epic>` goes through `cn review` together: what to
  look at, and the verb for each line. It writes nothing.

## Writing into an issue

Description, design, acceptance, an epic's description and every journal entry are
Markdown, and the person reads them on the web page, set: headings, lists, bold, links,
code, tables. A wall of plain text is what the page is there to avoid.

- **A body of more than a line goes in through stdin or a file, never through quoting.**
  `cn journal <id> --kind handoff @-` with a heredoc, or `--design @notes.md`; shell
  quoting is where multi-line text gets mangled.
- **The first line stands alone.** It is all `cn show` prints of a field and all `cn log`
  prints of an entry: a plain sentence that says what this is, never a heading.
- **Give the rest a shape.** Short paragraphs; `- ` lists; numbered steps where order
  matters; a `**bold lead.**` to open an item a reader will scan for; a table where
  options compare; `### A heading` only when a field holds several parts.
- **Acceptance is a `- ` list**, one criterion a line, each answerable yes or no.
- Commands, paths and ids in backticks, and output in a fenced block. A link as
  `[what it is](url)`. No raw HTML: the page shows it as text.

```bash
cn journal cn-14 --kind handoff @- <<'EOF'
Where it stands, in one plain sentence.

- done: …
- unverified: …
- next: …
EOF
```

## When the person speaks plainly

The web page offers the person lines to say, never commands to run: "Explain cn-14 "…"
in plain terms: what it's about and why it matters", "Catch me up on cn-14 "…": where it
stands, what's been tried, what's left", "cn-14 "…" has been quiet for 9 days. Find out
why and tell me what it needs to move", "ep-3 "…" has gotten messy. Help me sort it out".
A message that names an issue, epic or blocker in the reference form and asks about it is
one of these, whether or not it came from the page. Read before answering, every time:
`cn show <id>` for an issue or a blocker, with `--history` when the question is what
happened or what was tried; `cn show <ep>` and `cn review <ep>` for an epic. Then answer
in the person's terms — where it stands, what has been tried, what it needs, what the
options cost — and take the verb that follows yourself: `cn claim <id>` for "pick it up",
`cn wait <id>` for what needs them, `cn resolve <bl> --said` with their words for a
blocker they settle, `cn dep add` for a duplicate found. Never hand back a `cn` line or a
slash command for the person to paste. Steering agents is not their job.

"Explain" asks for meaning, not status, and quickly. Where the issue has no description,
a follow-up often has only a title in cairn's own terms, with its context on the parent:
read the parent, and the epic, before answering. Then the reference form on its own line,
and under it three short lines, each opened by a bold lead and each its own paragraph,
since a reply is set as Markdown and lines that touch run together:

```
app-14 "fix connection retry"

**What it is.** The app gives up after one dropped connection, so a tunnel signs you out.

**Why it matters.** People on the move lose what they typed and have to sign in again.

**Where it stands.** A fix works on Android. Left: a check on an iPhone.
```

About 50 words after the reference, as in the example, and never past 80: each line is
one idea in one or two short sentences, about 15 words after its lead, and no sentence runs
past 20. Cut the example, the aside, the second clause. **Where it stands.** is the state and what is left,
never why what is left is waiting or what finishing it unlocks. Plain words: no file, function or event names, no ids past the first reference,
no list of cases; the person asks "catch me up" for the rest.

**Every answer to one of these has a shape.** Lead with the answer in one line. Give the
rest as short lines opened by a bold lead, or as a `- ` list: never a paragraph of more
than three sentences, and never a sentence past 20 words. Stop once the question is
answered; the person asks for more when they want it.

- **Catch me up**: **Where it stands.**, **Tried.** and **Left.**
- **Quiet**: **Why it's quiet.** and **What it needs.**, the second naming the verb you took.
- **Still worth doing**: **For.**, **Against.** and **My call.**

## Three boundaries

- **Agents raise human blockers, and end one only on the person's word.** When they say
  what settles it, `cn resolve <bl> --note "<what was decided>" --said "<their words,
  verbatim>"`; `cn ack <bl> --said "…"` when they have only seen it. Never on your own
  judgment, a guess at what they meant, or words that answer something else.
- **Closing takes evidence.** A command and its output, or `unverified` with a reason.
  Prose is what an agent fabricates.
- **Residue becomes a follow-up, not a hanging parent.** Verified on Android and web but
  not iOS: close it, spawn a `verify` follow-up titled for what it needs, `verify: the
  retry path on an iPhone`, move on.
