// Markdown.tsx: the text people and agents write into an issue, set to be read. It is
// Markdown, CommonMark with GitHub's tables, task lists, strikethrough and bare links, and
// the text written before it was (paragraphs, `- ` lists, backticks) reads the same. Raw
// HTML is shown as the text it is and never run, and a `javascript:` link goes nowhere:
// react-markdown builds React elements and passes nothing through as markup.
//
// Every element is set from the tokens and none of them in a hue, since chroma means state
// (index.css): a heading is weight, a link is an underline, code is a tint.
//
// The page reaches this file through Prose.tsx alone, and only by `import()`: react-markdown
// and remark-gfm are a quarter of the page's script, so they load beside it (cn-98).
import { Check } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** A link that leaves the page opens beside it; one into the page is left to location.ts. */
const leaves = (href: string | undefined): boolean => href !== undefined && /^https?:/i.test(href);

// react-markdown hands each component its hast node too, which is not a DOM prop.
const bare = <P extends { node?: unknown }>({ node: _node, ...rest }: P) => rest;

// A heading inside a passage stays under the page's own: weight first, size only at the top.
const heading = "mt-1.5 font-[650] text-ink first:mt-0";
const nested = "[&_ol]:mt-1 [&_ul]:mt-1";

const components: Components = {
  h1: (props) => <h3 {...bare(props)} className={cn(heading, "text-title")} />,
  h2: (props) => <h3 {...bare(props)} className={cn(heading, "text-title")} />,
  h3: (props) => <h4 {...bare(props)} className={heading} />,
  h4: (props) => <h4 {...bare(props)} className={heading} />,
  h5: (props) => <h4 {...bare(props)} className={heading} />,
  h6: (props) => <h4 {...bare(props)} className={heading} />,
  strong: (props) => <strong {...bare(props)} className="font-[620] text-ink" />,
  del: (props) => <del {...bare(props)} className="text-slate" />,
  a: ({ href, ...props }) => (
    <a
      {...bare(props)}
      href={href}
      {...(leaves(href) ? { target: "_blank", rel: "noreferrer" } : {})}
      className="underline decoration-mark underline-offset-[3px] transition-colors hover:decoration-ink"
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      {...bare(props)}
      className={cn(
        "grid gap-1",
        nested,
        className === "contains-task-list" ? "list-none" : "list-disc pl-[1.1em] marker:text-mark",
      )}
    />
  ),
  ol: (props) => (
    <ol
      {...bare(props)}
      className={cn(
        "grid list-decimal gap-1 pl-[1.6em] marker:font-mono marker:text-small marker:text-slate",
        nested,
      )}
    />
  ),
  // A task's box hangs in the margin, so its text wraps under itself and not under the box.
  li: ({ className, ...props }) => (
    <li
      {...bare(props)}
      className={
        className === "task-list-item" ? "pl-[1.45em] -indent-[1.45em] *:indent-0" : undefined
      }
    />
  ),
  // Drawn from the tokens rather than the browser's box, which greys out a disabled one so
  // that ticked and unticked read alike. A mark, not a control: the page only reads.
  input: ({ checked }) => (
    <span
      role="img"
      aria-label={checked ? "done" : "not done"}
      className={cn(
        "mr-[0.3em] inline-flex size-[0.9em] -translate-y-[0.06em] items-center justify-center rounded-[3px] border align-middle",
        checked ? "border-ink bg-ink text-mist" : "border-faint",
      )}
    >
      {checked && <Check className="size-[0.72em]" strokeWidth={3.5} aria-hidden />}
    </span>
  ),
  blockquote: (props) => (
    <blockquote {...bare(props)} className="grid gap-2 border-l-2 border-mark pl-3.5 text-slate" />
  ),
  // A fenced block's text ends in a newline and an inline span's never does: CommonMark
  // turns a line ending inside backticks into a space. The block sets its own tint.
  code: ({ children, ...props }) =>
    typeof children === "string" && children.endsWith("\n") ? (
      <code {...bare(props)}>{children}</code>
    ) : (
      <code
        {...bare(props)}
        className="rounded-[5px] bg-ink/[0.05] px-[0.3em] py-[0.05em] font-mono text-[0.92em]"
      >
        {children}
      </code>
    ),
  pre: (props) => (
    <pre
      {...bare(props)}
      className="overflow-x-auto rounded-[9px] bg-ink/[0.045] px-3.5 py-3 font-mono text-small text-code"
    />
  ),
  hr: (props) => <hr {...bare(props)} className="my-1 border-hair" />,
  // A table wider than the passage scrolls inside it, not the page.
  table: (props) => (
    <div className="overflow-x-auto">
      <table {...bare(props)} className="w-full border-collapse text-small" />
    </div>
  ),
  th: (props) => (
    <th
      {...bare(props)}
      className="border-b border-hair px-2 py-1.5 text-left align-bottom font-[550] text-slate first:pl-0"
    />
  ),
  td: (props) => (
    <td {...bare(props)} className="border-b border-hair px-2 py-1.5 align-top first:pl-0" />
  ),
  img: ({ alt, ...props }) => (
    <img
      {...bare(props)}
      alt={alt ?? ""}
      loading="lazy"
      className="max-h-96 max-w-full rounded-[9px] border border-hair"
    />
  ),
};

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("grid max-w-[68ch] gap-2.5 text-body break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
