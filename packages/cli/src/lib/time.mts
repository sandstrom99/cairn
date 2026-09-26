// time.mts: how long ago, in one token. Every line cn prints and every row the web window
// sets says when something happened the same way, so the words are spelled here once:
// `just now`, `5m`, `2h`, `3d`, and the three forms built on them.

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** How long ago, in one token: `just now`, `5m`, `2h`, `3d`. */
export function age(sinceMs: number, now: number = Date.now()): string {
  const ms = Math.max(0, now - sinceMs);
  if (ms < MINUTE) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/** `2h ago`, but `just now` reads as itself. */
export const since = (at: number, now: number): string => {
  const token = age(at, now);
  return token === "just now" ? token : `${token} ago`;
};

/** The date alone, `2026-10-01`: a day somebody looks again, where the hour is noise. */
export const day = (at: number): string => new Date(at).toISOString().slice(0, 10);

/**
 * How long a claim has been silent: `26h`, `47h`, then `2d`, `9d`. It is only ever printed
 * past the 24-hour threshold, so the first two days stay in hours, where `1d` would hide
 * how far past the line a claim is; beyond that a day is the unit that means anything.
 */
export const silence = (sinceMs: number, now: number): string => {
  const ms = Math.max(0, now - sinceMs);
  return ms < 2 * DAY ? `${Math.floor(ms / HOUR)}h` : age(sinceMs, now);
};
