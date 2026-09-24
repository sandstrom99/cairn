// testing.tsx: how a test reads what a component renders. The suite has no DOM, so a
// component renders to a string and its text is read the way a reader selecting it would
// get it (plain.ts). `rows` never slices markup to find a list: it walks every `li`, so a
// list added above another moves no test.
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { plain } from "./plain.ts";

/** The text of the element, rendered. */
export const text = (element: ReactElement): string => plain(renderToStaticMarkup(element));

/** The text of every top-level row of the element's lists, in order, a nested list folded into its row. */
export function rows(element: ReactElement): string[] {
  const markup = renderToStaticMarkup(element);
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (const tag of markup.matchAll(/<li\b|<\/li>/g)) {
    if (tag[0] === "</li>") {
      depth -= 1;
      if (depth === 0) out.push(plain(markup.slice(start, tag.index)));
    } else {
      if (depth === 0) start = tag.index;
      depth += 1;
    }
  }
  return out;
}
