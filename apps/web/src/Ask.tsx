// Ask.tsx: the ask menu. A round `?` beside Copy reference opens a speech bubble holding the
// lines a person can say to their agent about the thing on screen, numbered like dialogue
// choices. The lines are chosen by the item's kind and state in prompts.ts. Each is a
// sentence to say, never a command to run. Choosing one puts the whole sentence on the
// clipboard with every reference in the reference form, so the session it is pasted into
// knows what is meant. The menu itself shows only the id, because a title makes a menu hard
// to read.
//
// The keycap is the cursor: arrows move it, Enter or the line's number copies. `?` opens the
// menu from anywhere on the page outside a text field. Escape and a click outside close it
// through Radix.
import { Check } from "lucide-react";
import { type CSSProperties, Fragment, type Ref, useEffect, useRef, useState } from "react";
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { copy } from "./CopyRef.tsx";
import { type Prompt, sentence } from "./prompts.ts";

/** The lines, numbered, with the active one lit. Pure, so a test can render it to a string. */
export function AskList({
  prompts,
  active,
  copied,
  onHover,
  onPick,
  listRef,
}: {
  prompts: Prompt[];
  active: number;
  /** The line just copied, whose keycap shows a check. */
  copied?: number;
  onHover?: (i: number) => void;
  onPick?: (i: number) => void;
  listRef?: Ref<HTMLUListElement>;
}) {
  return (
    <ul
      ref={listRef}
      role="menu"
      aria-label="Say to your agent"
      tabIndex={-1}
      className="flex flex-col gap-0.5 outline-hidden"
    >
      {prompts.map((p, i) => (
        <li
          key={p.key}
          role="menuitem"
          tabIndex={-1}
          // `--i` is read by the cascade in index.css, which staggers the lines settling.
          style={{ "--i": i } as CSSProperties}
          onMouseEnter={() => onHover?.(i)}
          onClick={() => onPick?.(i)}
          className={cn(
            "ask-line grid cursor-pointer grid-cols-[22px_minmax(0,1fr)] items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-row",
            i === active && "bg-lift/80 shadow-ring",
          )}
        >
          <kbd
            className={cn(
              "mt-px inline-flex size-[22px] items-center justify-center rounded-full bg-lift font-mono text-xs text-slate shadow-ring",
              i === active && "bg-ink text-mist shadow-none",
            )}
          >
            {i === copied ? <Check className="size-3" /> : i + 1}
          </kbd>{" "}
          <span>
            {p.parts.map((part, j) =>
              typeof part === "string" ? (
                // The pieces of one sentence never reorder, so the index is a stable key.
                <Fragment key={j}>{part}</Fragment>
              ) : (
                <span key={j} className="font-mono text-[0.92em] text-code">
                  {part.id}
                </span>
              ),
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Whether a key pressed here is text being typed, which `?` must not interrupt. */
const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

export function Ask({ prompts }: { prompts: Prompt[] }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState<number | undefined>(undefined);
  const [done, setDone] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const empty = prompts.length === 0;

  const show = (next: boolean) => {
    if (next) setActive(0);
    setOpen(next);
  };

  const pick = (i: number) => {
    const prompt = prompts[i];
    if (prompt === undefined) return;
    void copy(sentence(prompt)).then((ok) => {
      if (!ok) return;
      setCopied(i);
      setDone(true);
    });
  };

  // The row's check shows a beat, then the bubble closes.
  useEffect(() => {
    if (copied === undefined) return;
    const timeout = setTimeout(() => {
      setOpen(false);
      setCopied(undefined);
    }, 700);
    return () => clearTimeout(timeout);
  }, [copied]);

  // The check on the button, as long as Copy reference's.
  useEffect(() => {
    if (!done) return;
    const timeout = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(timeout);
  }, [done]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?" || open || empty || typing(event.target)) return;
      event.preventDefault();
      setActive(0);
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, empty]);

  if (empty) return null;
  const last = prompts.length - 1;

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Say to your agent"
          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full bg-lift font-mono text-[14px] font-semibold text-slate shadow-ring hover:text-ink data-[state=open]:text-ink"
        >
          {done ? <Check className="size-[13px]" /> : "?"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="glass ask-pop relative w-[min(420px,calc(100vw-32px))] gap-0 rounded-2xl bg-transparent p-1.5 pt-2.5 pb-2 text-ink"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          listRef.current?.focus();
        }}
        onKeyDown={(event) => {
          const { key } = event;
          if (key === "ArrowDown") setActive((i) => (i >= last ? 0 : i + 1));
          else if (key === "ArrowUp") setActive((i) => (i <= 0 ? last : i - 1));
          else if (key === "Home") setActive(0);
          else if (key === "End") setActive(last);
          else if (key === "Enter" || key === " ") pick(active);
          else if (/^[1-9]$/.test(key) && Number(key) - 1 <= last) pick(Number(key) - 1);
          else return;
          event.preventDefault();
        }}
      >
        <PopoverArrow width={14} height={7} className="fill-glass/80" />
        <p className="px-2.5 pb-2 text-meta text-slate">Say to your agent</p>
        <AskList
          prompts={prompts}
          active={active}
          copied={copied}
          onHover={setActive}
          onPick={pick}
          listRef={listRef}
        />
        <p className="px-2.5 pt-2 text-micro text-faint">
          Copies the line, reference and all. Paste it into any session.
        </p>
      </PopoverContent>
    </Popover>
  );
}
