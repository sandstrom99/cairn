// theme.ts: light or dark, kept per browser.
//
// The page follows the system until the reader chooses, and then the choice, in this browser
// and no other: it is a convenience of theirs like the column, not a fact about the worklist,
// so it lives in localStorage beside the secret. Following the system is stored as the key's
// absence. The theme is the `dark` class on `<html>`, which index.css reads, and the script in
// index.html puts it there before first paint from the same key and the same media query, so a
// dark page never flashes light.

import { safeStorage } from "./storage.ts";

export const THEME_KEY = "cairn:theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";
export type Theme = "light" | "dark";

/** This browser's choice; undefined when it has made none, the value is anything else, or storage is unreadable. */
export function readTheme(
  storage: Pick<Storage, "getItem"> | undefined = safeStorage(),
): Theme | undefined {
  try {
    const value = storage?.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers the choice. Never throws. */
export function writeTheme(
  theme: Theme,
  storage: Pick<Storage, "setItem"> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // A storage that refuses to be written is the same as none: the page still switches, it
    // just follows the system again next load.
  }
}

/** What the system prefers: dark when the query matches, else light, and light with no window (a test). */
export function systemTheme(matches: boolean = matchesDark()): Theme {
  return matches ? "dark" : "light";
}

/** The theme the page shows: the browser's choice, else the system's. */
export const resolveTheme = (chosen: Theme | undefined, system: Theme): Theme => chosen ?? system;

/** Puts the theme on <html> as the `dark` class, where index.css reads it. Nothing without a document. */
export function applyTheme(
  theme: Theme,
  root: Pick<Element, "classList"> | undefined = globalThis.document?.documentElement,
): void {
  root?.classList.toggle("dark", theme === "dark");
}

/** Calls `listen` with the system's theme each time it changes; returns the unsubscribe. Nothing without a window. */
export function onSystemTheme(
  listen: (theme: Theme) => void,
  query: MediaQueryList | undefined = queryDark(),
): () => void {
  if (query === undefined) return () => {};
  const changed = (event: MediaQueryListEvent) => listen(event.matches ? "dark" : "light");
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

function queryDark(): MediaQueryList | undefined {
  try {
    return globalThis.matchMedia?.(DARK_QUERY);
  } catch {
    return undefined;
  }
}

function matchesDark(): boolean {
  return queryDark()?.matches ?? false;
}
