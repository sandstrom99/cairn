// plain.ts: the text of a piece of markup, the way a reader selecting it would get it:
// a break where a block ends, the other tags gone, entities decoded, runs of whitespace
// closed up. For tests, which render to a string because the suite carries no DOM.
const ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&#x27;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
};

/** Whitespace closed up to single spaces: cn pads its columns, a page sets them. */
export const squeeze = (text: string): string => text.replace(/\s+/g, " ").trim();

/** The elements the page uses as blocks. A row is an `li`, never a bare link, for this. */
const BLOCK_END = /<\/(?:div|h[1-6]|header|li|p|section|ul)>/g;

export const plain = (markup: string): string =>
  squeeze(
    markup
      .replace(BLOCK_END, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(?:quot|#x27|amp|lt|gt);/g, (e) => ENTITIES[e] ?? e),
  );
