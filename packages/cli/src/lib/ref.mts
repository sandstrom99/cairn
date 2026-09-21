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

/**
 * The form in its two pieces, for a surface that typesets it rather than printing it: the
 * id, and the title exactly as it prints between the quotes, escapes included. The web
 * window sets the id in one face and the title in another, and the text it ends up with
 * is still `ref()`'s.
 */
export const refParts = ({ id, title }: Referable): Referable => ({
  id,
  title: JSON.stringify(title).slice(1, -1),
});

/** `app-14 "fix connection retry"`. */
export const ref = (item: Referable): string => {
  const { id, title } = refParts(item);
  return `${id} "${title}"`;
};
