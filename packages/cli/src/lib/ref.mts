// ref.mts: the reference form. Every mention of an issue or epic — in a reply, a
// journal entry, a commit, a cn output line — carries its id AND its title:
//
//   app-14 "fix connection retry"
//
// A bare id is a bug. Beads ids like `invyte-wu03.2` gave the reader nothing to hold on
// to, and a session's worth of "working on wu03.2" was unreadable a day later. Every
// list line starts with this form, `--json` carries both fields, and a URL into the web
// app slots in behind the same form later (docs/design.md §10).

export type Referable = { id: string; title: string };

/** `app-14 "fix connection retry"`. */
export const ref = ({ id, title }: Referable): string => `${id} ${JSON.stringify(title)}`;
