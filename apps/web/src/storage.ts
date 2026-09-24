// storage.ts: this browser's localStorage, or nothing. The page keeps two things there,
// the secret (secret.ts) and whether the column is collapsed (column.ts), and both
// tolerate having nowhere to keep them: a test has no localStorage, and a browser in
// private mode has one that throws on touch. So it is reached for here, once, and passed
// in everywhere else.

/** `globalThis.localStorage`, or undefined where there is none or the accessor throws. */
export function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}
