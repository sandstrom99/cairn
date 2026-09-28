// Sheet.tsx: what every page for one id is made of. The way back up, the heading with its
// reference, the button that copies it and the ask menu, one line of state, and the sheet:
// `cn show`'s labelled lines set as a two-column table, label then value, with the long text
// an issue carries set in the same two columns under them.
//
// The facts are `issueFacts` and `blockerFacts` from @cairn/cli, the ones `cn show` prints,
// so the table says what the brief says, in its words and its order (sheet.test.tsx).
import type { Fact, LinkParts } from "@cairn/cli/parts";
import { type Referable, ref } from "@cairn/cli/ref";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Ask } from "./Ask.tsx";
import { CopyRef } from "./CopyRef.tsx";
import { Title } from "./page.tsx";
import type { Prompt } from "./prompts.ts";
import { Ref, Refs, Run } from "./Ref.tsx";
import { StateWord } from "./tone.tsx";

/** Where this page sits: the overview, then the epic where there is one. */
export function Crumbs({ epic, children }: { epic?: Referable; children?: ReactNode }) {
  return (
    <nav
      aria-label="Where this is"
      className="flex min-h-7 items-center gap-2 text-small text-slate"
    >
      <a href="/" className="hover:text-ink">
        Overview
      </a>
      {epic && (
        <>
          <span className="text-mark">/</span>
          <Ref item={epic} clip className="hover:text-ink" />
        </>
      )}
      {children && <span className="ml-auto flex shrink-0 items-center gap-1">{children}</span>}
    </nav>
  );
}

export function Heading({ item, prompts }: { item: Referable; prompts?: Prompt[] }) {
  return (
    <header className="mt-5">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-body font-medium text-slate">{item.id}</span>{" "}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <CopyRef item={item} />{" "}
          {prompts !== undefined && prompts.length > 0 && <Ask prompts={prompts} />}
        </span>
      </div>
      <Title className="mt-1.5 text-balance narrow:text-[1.5rem]">{item.title}</Title>
    </header>
  );
}

/** How the thing is doing, in one line: the state word in its colour, then the rest. */
export function State({ word, children }: { word: string; children?: ReactNode }) {
  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-body">
      <StateWord word={word} /> {children && <span className="text-slate">{children}</span>}
    </p>
  );
}

const LINE =
  "grid grid-cols-[116px_minmax(0,1fr)] items-baseline gap-3 px-4 py-[11px] narrow:grid-cols-1 narrow:gap-1";

/**
 * `cn show`'s labelled lines, and under them whatever long text the page passes in. A
 * fact that opens with something that ran sets it in mono, because it gets pasted.
 */
export function Sheet({ facts, children }: { facts: Fact[]; children?: ReactNode }) {
  return (
    <div className="paper mt-6 divide-y divide-hair">
      <dl className="divide-y divide-hair">
        {facts.map(({ label, code, text, refs, links }) => (
          <div key={label} className={LINE}>
            <dt className="text-small text-slate">{label}</dt>{" "}
            <dd className="text-row">
              {code && <code className="font-mono">{code} </code>}
              {links ? (
                <LinkList items={links} />
              ) : refs ? (
                <Refs items={refs} />
              ) : (
                <Run text={text ?? ""} />
              )}
            </dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}

/** Only http and https become an anchor: the deployment refuses the rest; this checks again. */
const OPENABLE = /^https?:\/\//i;

/**
 * An issue's links, one item each, each item the text of cn's `linkLine`: the label as the
 * anchor and the URL after it in slate, or the URL as the anchor, then who added it. Items
 * and not spans, because the page's plain text breaks a line at `</li>`.
 */
function LinkList({ items }: { items: LinkParts[] }) {
  return (
    <ul>
      {items.map(({ url, label, by }) => {
        const text = label ?? url;
        return (
          <li key={url}>
            {OPENABLE.test(url) ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-mark underline-offset-[3px] transition-colors hover:decoration-ink"
              >
                {text}
              </a>
            ) : (
              text
            )}
            {label && <span className="text-slate"> · {url}</span>}
            <span className="text-slate"> · {by}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A piece of long text in the sheet's two columns: its name, then the text. */
export function Passage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={cn(LINE, "py-4")}>
      <h2 className="text-small text-slate">{label}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** The issue before and the issue after, in the order the epic lists them. */
export function Neighbours({
  before,
  after,
  where,
  compact = false,
}: {
  before?: Referable;
  after?: Referable;
  where: string;
  compact?: boolean;
}) {
  if (!before && !after) return null;
  if (compact)
    return (
      <>
        <Step item={before} label="Previous">
          <ChevronLeft className="size-4" />
        </Step>
        <span className="px-1 font-mono text-meta">{where}</span>
        <Step item={after} label="Next">
          <ChevronRight className="size-4" />
        </Step>
      </>
    );
  return (
    <nav
      aria-label="Previous and next in this epic"
      className="mt-10 grid grid-cols-2 gap-3 narrow:grid-cols-1"
    >
      {before ? <Card item={before} label="Previous" /> : <span />}
      {after ? <Card item={after} label="Next" end /> : <span />}
    </nav>
  );
}

function Step({ item, label, children }: { item?: Referable; label: string; children: ReactNode }) {
  const box = "grid size-7 place-items-center rounded-lg";
  if (!item) return <span className={cn(box, "text-mark")}>{children}</span>;
  return (
    <a
      href={`/${item.id}`}
      aria-label={`${label}: ${ref(item)}`}
      title={ref(item)}
      className={cn(box, "bg-lift text-slate shadow-ring hover:text-ink")}
    >
      {children}
    </a>
  );
}

function Card({ item, label, end = false }: { item: Referable; label: string; end?: boolean }) {
  return (
    <a
      href={`/${item.id}`}
      className={cn(
        "paper block px-4 py-3 hover:bg-glass hover:[&_.ref-title]:underline",
        end && "text-right",
      )}
    >
      <span className="block text-meta text-slate">{label}</span>
      <Ref
        item={item}
        plain
        clip
        className={cn(
          "mt-0.5 text-row decoration-faint underline-offset-[3px]",
          end && "justify-end",
        )}
      />
    </a>
  );
}
