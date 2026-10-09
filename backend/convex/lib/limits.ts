// limits.ts: the sizes a reader meets, named once so the functions that cut to them and
// the page that says so agree: show.get carries `JOURNAL_HEAD` journal entries unless asked
// for up to `JOURNAL_MAX`, events.recent hands back at most `LOG_LIMIT` events in one page,
// brief.get heads `UP_NEXT` ready, stuck and recent rows when the Overview asks, search.find takes at
// most `SEARCH_HITS` rows back from a text index, and an epic's show.get names the
// `NEXT_HEAD` newest directions its finished issues left.

/** The journal entries show.get carries: the newest, which is what a session needs before it starts. */
export const JOURNAL_HEAD = 5;
/** The most journal entries one show.get answer holds: the page asks for this many, and paging past it waits for a journal that long. */
export const JOURNAL_MAX = 200;
/** The most events one events.recent page holds; `cn log --limit` and the log page read up to it. */
export const LOG_LIMIT = 200;
/** The ready rows the Overview's "Up next" asks the brief for; `cn brief` asks for none and gets the brief's own three. */
export const UP_NEXT = 5;
/** The most rows Convex hands back from one text search. */
export const SEARCH_HITS = 1024;
/** The directions an epic's show.get carries: the newest its finished issues left, which is where the work was last pointed. */
export const NEXT_HEAD = 3;
