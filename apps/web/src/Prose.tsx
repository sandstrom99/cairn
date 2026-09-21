// Prose.tsx: the text people and agents write into an issue, set to be read. It is plain
// text with three habits, and only those are honoured: a blank line ends a paragraph, a
// line that opens `- ` is a list item, and `backticks` mark something typed. It is not
// markdown and does not try to be: nothing here is parsed that an agent did not mean.
import { Fragment } from "react";

type Block = { list: boolean; lines: string[] };

/** Paragraphs and lists, in order. A list ends where a line stops opening with `- `. */
export function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let open: Block | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      open = undefined;
      continue;
    }
    const item = /^\s*- /.test(line);
    if (!open || open.list !== item) {
      open = { list: item, lines: [] };
      blocks.push(open);
    }
    open.lines.push(item ? line.replace(/^\s*- /, "") : line);
  }
  return blocks;
}

function Inline({ text }: { text: string }) {
  // Odd pieces sat between two backticks. An unclosed one is left as written.
  const pieces = text.split("`");
  if (pieces.length % 2 === 0) return <>{text}</>;
  return (
    <>
      {pieces.map((piece, i) =>
        i % 2 === 1 ? (
          // The pieces of one line never reorder, so the index is a stable key.
          <code
            key={i}
            className="rounded-[5px] bg-ink/[0.05] px-[0.3em] py-[0.05em] font-mono text-[0.92em]"
          >
            {piece}
          </code>
        ) : (
          <Fragment key={i}>{piece}</Fragment>
        ),
      )}
    </>
  );
}

export function Prose({ text }: { text: string }) {
  return (
    <div className="grid max-w-[68ch] gap-2.5 text-body">
      {blocksOf(text).map((block, i) =>
        block.list ? (
          <ul key={i} className="grid list-disc gap-1 pl-[1.1em] marker:text-mark">
            {block.lines.map((line, j) => (
              <li key={j}>
                <Inline text={line} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inline text={block.lines.join(" ")} />
          </p>
        ),
      )}
    </div>
  );
}
