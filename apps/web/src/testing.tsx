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

/** The text of every element carrying `data-fact`, in order: each one of cn's labelled lines as the page sets it. */
export function facts(element: ReactElement): string[] {
  const markup = renderToStaticMarkup(element);
  const out: string[] = [];
  for (const open of markup.matchAll(/<(\w+)[^>]*\bdata-fact="[^"]*"[^>]*>/g)) {
    const tag = open[1]!;
    const pattern = new RegExp(`<${tag}\\b|</${tag}>`, "g");
    pattern.lastIndex = open.index + open[0].length;
    let depth = 1;
    let end = markup.length;
    for (let m = pattern.exec(markup); m; m = pattern.exec(markup)) {
      depth += m[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = m.index;
        break;
      }
    }
    out.push(plain(markup.slice(open.index, end)));
  }
  return out;
}
