// limits.ts: the sizes a reader meets, named once so the functions that cut to them and
// the page that says so agree: show.get carries `JOURNAL_HEAD` journal entries unless asked
// for up to `JOURNAL_MAX`, events.recent hands back at most `LOG_LIMIT` events in one page,
// brief.get heads `UP_NEXT` ready rows when the Overview asks, and search.find hands a text
// index at most `SEARCH_TERMS` terms and takes at most `SEARCH_HITS` rows back from it.

/** The journal entries show.get carries: the newest, which is what a session needs before it starts. */
export const JOURNAL_HEAD = 5;
/** The most journal entries one show.get answer holds: the page asks for this many, and paging past it waits for a journal that long. */
export const JOURNAL_MAX = 200;
/** The most events one events.recent page holds; `cn log --limit` and the log page read up to it. */
export const LOG_LIMIT = 200;
/** The ready rows the Overview's "Up next" asks the brief for; `cn brief` asks for none and gets the brief's own three. */
export const UP_NEXT = 5;
/** The most terms Convex takes in one text search; search.find hands the index the first this many. */
export const SEARCH_TERMS = 16;
/** The most rows Convex hands back from one text search. */
export const SEARCH_HITS = 1024;
