// platform.ts: the one thing the page says differently per machine, the key that opens the
// jump bar. A Mac reads ⌘K and everything else Ctrl K; the keydown handler takes either.
type Nav = { platform?: string; userAgentData?: { platform?: string } };

/** The label for the jump bar's shortcut on this machine: `⌘K` on Apple platforms, `Ctrl K` elsewhere. */
export function shortcut(nav: Nav | undefined = globalThis.navigator as Nav | undefined): string {
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K";
}
