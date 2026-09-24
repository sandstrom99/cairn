// location.ts: which page this is. Four routes do not need a router: the path is the
// state, `history.pushState` changes it, and one listener on the document turns every
// plain same-origin link into that instead of a page load. So components write `<a href>`
// and nothing else: a link works before the script loads, opens in a new tab with a
// modifier held, renders to a string in a test with no router around it, and keeps the
// live subscriptions when it is simply clicked.
import { useEffect, useSyncExternalStore } from "react";

export type Route =
  | { page: "overview" }
  | { page: "issues" }
  | { page: "log" }
  | { page: "item"; id: string };

/** An id as cn mints one: a project slug, `ep` or `bl`, a dash and a number. */
const ID = /^[a-z][a-z0-9]*-\d+$/;

/** Whether a string is an id as cn mints one, which is lowercase: lowercase what was typed first. */
export const isId = (text: string): boolean => ID.test(text);

/** `/` is the overview, `/issues` and `/log` are themselves, and `/app-14` is that id's page. */
export function routeOf(pathname: string): Route | undefined {
  const path = pathname.replace(/\/+$/, "");
  if (path === "") return { page: "overview" };
  if (path === "/issues") return { page: "issues" };
  if (path === "/log") return { page: "log" };
  const id = path.slice(1);
  return ID.test(id) ? { page: "item", id } : undefined;
}

const CHANGED = "cairn:navigate";

export function navigate(href: string): void {
  if (href === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", href);
  window.dispatchEvent(new Event(CHANGED));
  window.scrollTo(0, 0);
}

const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener("popstate", notify);
  window.addEventListener(CHANGED, notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener(CHANGED, notify);
  };
};

/** The current path, re-rendering the caller when it changes. */
export const usePath = (): string =>
  useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => "/",
  );

/** Whether a click on this link is the page's to handle, or the browser's. */
export function isOurs(
  event: Pick<
    MouseEvent,
    "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented"
  >,
  link: { origin: string; target: string; download?: boolean },
  origin: string,
): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target !== "" && link.target !== "_self") return false;
  return link.origin === origin && !link.download;
}

/** Turn plain clicks on same-origin links into `navigate`. Mounted once, by the shell. */
export function useLinks(): void {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!link) return;
      if (
        !isOurs(
          event,
          { origin: link.origin, target: link.target, download: link.hasAttribute("download") },
          window.location.origin,
        )
      )
        return;
      event.preventDefault();
      navigate(link.pathname + link.search);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}
