// links.ts: what an issue's work left behind, as URLs (docs/design.md §3, "Links"). A pull
// request, a commit, an artifact, a doc: each is a link like any other, because cairn knows
// no code host and reads nothing from one. A link is a URL, an optional label, who added it
// and when; the URL is its identity, compared as the exact trimmed string the writer gave.
//
// The field is edited like any other against the revision, and an event records what a
// reader should see (§3, "Revision and events"): `linkRecord` drops who and when, which
// the issue itself keeps.
import { v, type Infer } from "convex/values";
import { type Actor, actorValidator } from "./actor";
import { invalid } from "./errors";

/** What a caller sends: the URL and, when it has one, a label. */
export const linkInputValidator = v.object({ url: v.string(), label: v.optional(v.string()) });

export type LinkInput = Infer<typeof linkInputValidator>;

/** What the issue stores: the input, and who added it and when, stamped by the deployment. */
export const linkValidator = v.object({
  url: v.string(),
  label: v.optional(v.string()),
  by: actorValidator,
  at: v.number(),
});

export type Link = Infer<typeof linkValidator>;

/**
 * The URL trimmed, when it parses and is http or https; refused otherwise. This is the
 * guard that lets the page render a link as an anchor: no `javascript:`, no `data:` and
 * nothing that is not a URL at all is ever stored.
 */
export function checkUrl(url: string): string {
  const trimmed = url.trim();
  let protocol: string;
  try {
    protocol = new URL(trimmed).protocol;
  } catch {
    throw invalid(`${trimmed} is not an http or https URL`);
  }
  if (protocol !== "http:" && protocol !== "https:")
    throw invalid(`${trimmed} is not an http or https URL`);
  return trimmed;
}

/**
 * `current` with `add` put on it. A URL not there is appended with the stamp, in the order
 * given; one already there takes a label given with it and keeps who added it and when,
 * and given bare is left as it is, so linking twice is harmless. The same URL twice in one
 * call: the later wins. An empty label counts as none.
 */
export function addLinks(
  current: Link[],
  add: LinkInput[],
  stamp: { by: Actor; at: number },
): Link[] {
  const next = current.map((link) => ({ ...link }));
  for (const input of add) {
    const url = checkUrl(input.url);
    const label = input.label?.trim() || undefined;
    const there = next.find((link) => link.url === url);
    if (there === undefined)
      next.push({ url, ...(label === undefined ? {} : { label }), ...stamp });
    else if (label !== undefined) there.label = label;
  }
  return next;
}

/** `current` without the URLs given. A URL the issue does not carry is refused, naming it. */
export function removeLinks(current: Link[], remove: string[], id: string): Link[] {
  const urls = remove.map((given) => given.trim());
  for (const url of urls)
    if (!current.some((link) => link.url === url)) throw invalid(`${id} has no link ${url}`);
  return current.filter((link) => !urls.includes(link.url));
}

/**
 * An edit's links: `current` with `unlink` taken off, then `link` put on with the stamp. A
 * URL given to both is refused. Undefined when the edit changes nothing a reader sees, so
 * the caller writes nothing for it and moves no revision; `next` is undefined when no link
 * is left, which takes the field off.
 */
export function editLinks(
  current: Link[] | undefined,
  edit: { link?: LinkInput[]; unlink?: string[] },
  id: string,
  stamp: { by: Actor; at: number },
): { next: Link[] | undefined; change: { from: LinkInput[]; to: LinkInput[] } } | undefined {
  const link = edit.link ?? [];
  const unlink = edit.unlink ?? [];
  for (const url of unlink)
    if (link.some((l) => l.url.trim() === url.trim()))
      throw invalid(`${url.trim()} is both linked and unlinked`);
  const was = current ?? [];
  const next = addLinks(removeLinks(was, unlink, id), link, stamp);
  if (JSON.stringify(linkRecord(was)) === JSON.stringify(linkRecord(next))) return undefined;
  return {
    next: next.length > 0 ? next : undefined,
    change: { from: linkRecord(was), to: linkRecord(next) },
  };
}

/** What an event records of the links: each URL and its label, never who or when. */
export const linkRecord = (links: Link[]): LinkInput[] =>
  links.map(({ url, label }) => (label === undefined ? { url } : { url, label }));
