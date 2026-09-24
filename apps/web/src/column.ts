// column.ts: whether the right column is collapsed, kept per browser.
//
// A reader who collapses the column wants it collapsed next time too, in this browser and
// no other: it is a convenience of theirs, not a fact about the worklist, so it lives in
// localStorage beside the secret and nowhere the deployment would see. Open is the
// default and is stored as the key's absence.

import { safeStorage } from "./storage.ts";

export const COLUMN_KEY = "cairn:column";

/** Whether this browser last chose the column collapsed; false when unset, anything else, or unreadable. */
export function readCollapsed(
  storage: Pick<Storage, "getItem"> | undefined = safeStorage(),
): boolean {
  try {
    return storage?.getItem(COLUMN_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/** Remembers the choice: "collapsed" under the key, or the key removed for open. Never throws. */
export function writeCollapsed(
  collapsed: boolean,
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeStorage(),
): void {
  try {
    if (collapsed) storage?.setItem(COLUMN_KEY, "collapsed");
    else storage?.removeItem(COLUMN_KEY);
  } catch {
    // A storage that refuses to be written is the same as none: the column still collapses,
    // it just opens again next load.
  }
}
