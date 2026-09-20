// secret.ts: the deployment secret, in a browser.
//
// It fences a deployment, not an actor (backend/convex/lib/guard.ts): it says this caller
// may talk to this deployment at all, and nothing about who is calling. So it is the same
// string `cn` reads from `~/.config/cairn/config.json`, pasted into the page once and kept
// in this browser's localStorage alone — never in the bundle, never in an env var, where
// anyone served the page would get it too.
//
// Storage is passed in rather than reached for, because a test has no localStorage and a
// browser in private mode has one that throws on touch. Every path here tolerates both.

export const SECRET_KEY = "cairn:secret";

/**
 * The secret the dev server was started with, or undefined: always undefined in a build,
 * where vite.config.ts defines the constant as "". A pasted secret wins over it.
 */
export const devSecret = (): string | undefined =>
  (typeof __CAIRN_DEV_SECRET__ === "string" ? __CAIRN_DEV_SECRET__ : "") || undefined;

/** `globalThis.localStorage`, or undefined where there is none or the accessor throws. */
function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/** The stored secret, or undefined when it is absent, empty or unreadable. */
export function readSecret(
  storage: Pick<Storage, "getItem"> | undefined = safeStorage(),
): string | undefined {
  try {
    return storage?.getItem(SECRET_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/** Stores a secret; an empty or whitespace-only value removes it. */
export function writeSecret(
  value: string,
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeStorage(),
): void {
  const trimmed = value.trim();
  try {
    if (trimmed === "") storage?.removeItem(SECRET_KEY);
    else storage?.setItem(SECRET_KEY, trimmed);
  } catch {
    // A storage that refuses to be written is the same as none: the page still works,
    // it just asks for the secret again next load.
  }
}
