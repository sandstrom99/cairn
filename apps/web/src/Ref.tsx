// Ref.tsx: the reference form, typeset. The id in mono, the title in sans, and the quotes
// that hold the form together kept in the text but quietened, so what a reader copies off
// the page is `cn-26 "apps/web, the read-only window"`: the form every cn line, journal
// entry and commit uses, and one that pastes straight into a terminal.
//
// The pieces come from `refParts` in @cairn/cli, never from a second spelling here: the
// form is spelled in one place (packages/cli/src/lib/ref.mts).
//
// Every reference is a link to its own page, `/cn-26`: one URL per id is what gives the
// form somewhere to point.
import { type Referable, refParts } from "@cairn/cli/src/lib/ref.mts";
import { cn } from "@/lib/utils";

type Props = {
  item: Referable;
  /** Keep to one line and cut the title with an ellipsis, where a column is narrow. */
  clip?: boolean;
  /** Set when the row around it is already the link. */
  plain?: boolean;
  className?: string;
};

export function Ref({ item, clip = false, plain = false, className }: Props) {
  const { id, title } = refParts(item);
  const body = (
    <>
      <span className="shrink-0 font-mono text-[0.9em] font-medium text-slate">{id}</span>{" "}
      <span className={cn(clip && "flex min-w-0")}>
        <span className="text-mark">"</span>
        <span className={cn("ref-title", clip && "truncate")}>{title}</span>
        <span className="text-mark">"</span>
      </span>
    </>
  );
  const classes = cn(clip && "flex min-w-0 items-baseline gap-[0.4em]", className);
  if (plain)
    return (
      <span className={classes} title={clip ? item.title : undefined}>
        {body}
      </span>
    );
  return (
    <a
      href={`/${id}`}
      title={clip ? item.title : undefined}
      className={cn(
        classes,
        "rounded-sm decoration-faint underline-offset-[3px] hover:[&_.ref-title]:underline",
      )}
    >
      {body}
    </a>
  );
}

/** cn's `·`, where the page keeps it: in the text, and pale. */
export const Dot = () => <span className="text-mark"> · </span>;

/** A run of cn's text with its `·` separators quietened. The text is unchanged. */
export function Run({ text, className }: { text: string; className?: string }) {
  const parts = text.split(" · ");
  return (
    <span className={className}>
      {parts.map((part, i) => (
        // The parts of one line never reorder, so the index is a stable key.
        <span key={i}>
          {i > 0 && <Dot />}
          {part}
        </span>
      ))}
    </span>
  );
}
