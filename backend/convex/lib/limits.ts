// limits.ts: the two sizes a reader meets, named once so the functions that cut to them and
// the page that says so agree: show.get carries this many journal entries, and
// events.recent hands back at most this many events in one page.

/** The journal entries show.get carries: the newest, which is what a session needs before it starts. */
export const JOURNAL_HEAD = 5;
/** The most events one events.recent page holds; `cn log --limit` and the log page read up to it. */
export const LOG_LIMIT = 200;
