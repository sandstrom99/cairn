// limits.ts: the three sizes a reader meets, named once so the functions that cut to them and
// the page that says so agree: show.get carries `JOURNAL_HEAD` journal entries unless asked
// for up to `JOURNAL_MAX`, and events.recent hands back at most `LOG_LIMIT` events in one page.

/** The journal entries show.get carries: the newest, which is what a session needs before it starts. */
export const JOURNAL_HEAD = 5;
/** The most journal entries one show.get answer holds: the page asks for this many, and paging past it waits for a journal that long. */
export const JOURNAL_MAX = 200;
/** The most events one events.recent page holds; `cn log --limit` and the log page read up to it. */
export const LOG_LIMIT = 200;
