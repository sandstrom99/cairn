// JumpBar.tsx: go to anything by its id or a piece of its title. It floats where a chat
// page would put its composer, and it only reads: the reference form is how work is named
// everywhere else, so typing one is how a reader gets to it. ⌘K or Ctrl K from anywhere.
//
// The matching and the keyboard are cmdk's, through shadcn's Command. The haze content
// softens into under the bar is the bar's too, and runs the whole width, under the glass.
import type { Referable } from "@cairn/cli/ref";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { ColumnState } from "./Feed.tsx";
import { isId, navigate } from "./location.ts";
import { shortcut } from "./platform.ts";
import { Ref } from "./Ref.tsx";

/** Something the bar can go to, and the word that says what it is. */
export type Destination = Referable & { what: string };

/**
 * The rows for what was typed. A typed id that no list holds, a closed epic's or a
 * resolved blocker's, gets one row that opens it by id: the page for it is `show.get`,
 * which answers for anything ever minted, so nothing has to be listed to be reachable.
 */
export function withTyped(term: string, destinations: Destination[]): Destination[] {
  const typed = term.trim().toLowerCase();
  if (!isId(typed) || destinations.some((d) => d.id === typed)) return destinations;
  return [...destinations, { id: typed, title: "Open it by id", what: "" }];
}

/**
 * One row of the list: the reference form, then the word for what it is. A typed id no list
 * holds is marked by an empty `what` and is not a reference: it reads as the id and the offer.
 * The spaces between the pieces are there for the text; a flex row does not draw a bare one.
 */
export function JumpRow({ id, title, what }: Destination) {
  return (
    <>
      {what === "" ? (
        <>
          <span className="shrink-0 font-mono text-meta text-slate">{id}</span>{" "}
          <span className="truncate">{title}</span>
        </>
      ) : (
        <Ref item={{ id, title }} plain clip className="min-w-0" />
      )}{" "}
      <span className="ml-auto pl-3 text-meta whitespace-nowrap text-slate">{what}</span>
    </>
  );
}

export function JumpBar({
  destinations,
  column,
}: {
  destinations: Destination[];
  /** What stands on the right, which the bar centres itself clear of: the column, its strip, or nothing. */
  column: ColumnState;
}) {
  const [term, setTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const open = focused && term.trim() !== "";
  return (
    <>
      {/* Above main's content and below the glass, across the whole width. Cut to main's width,
          as it was, it stopped in a straight line at each column's bounding box, and the ground
          showed in the wedge between that line and the glass's rounded corner. */}
      <div className="under-bar pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[132px]" />
      <div
        className={cn(
          "folds pointer-events-none fixed bottom-[22px] left-(--main-left) z-30 flex justify-center px-10 narrow:left-0 narrow:px-4",
          column === "none"
            ? "right-0"
            : column === "open"
              ? "right-(--main-right) mid:right-0"
              : "right-(--main-right-strip) mid:right-0",
        )}
      >
        <Command
          label="Go to an issue, epic or blocker"
          className="pointer-events-auto relative h-auto w-[min(560px,100%)] overflow-visible rounded-none! bg-transparent p-0"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            setTerm("");
            input.current?.blur();
          }}
        >
          {open && (
            <CommandList className="glass absolute inset-x-0 bottom-16 rounded-[18px] p-1.5">
              <CommandEmpty className="px-3 py-2.5 text-left text-row text-slate">
                Nothing here is called that. Try an id like cn-26.
              </CommandEmpty>
              {withTyped(term, destinations).map(({ id, title, what }) => (
                <CommandItem
                  key={id}
                  value={`${id} ${title}`}
                  onSelect={() => {
                    navigate(`/${id}`);
                    setTerm("");
                    input.current?.blur();
                  }}
                  className="gap-1.5 rounded-xl px-3 py-[9px] text-[0.875rem] data-selected:bg-lift [&>svg:last-child]:hidden"
                >
                  <JumpRow id={id} title={title} what={what} />
                </CommandItem>
              ))}
            </CommandList>
          )}
          <label className="glass-bar relative flex h-[54px] items-center gap-3 rounded-full pr-4 pl-5">
            <Search className="size-[17px] shrink-0 text-slate" />
            <CommandPrimitive.Input
              ref={input}
              value={term}
              onValueChange={setTerm}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Go to cn-26, ep-4 or a title"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-hidden placeholder:text-slate"
            />
            <kbd className="rounded-[7px] bg-lift px-[7px] py-[3px] font-mono text-xs text-slate shadow-ring">
              {shortcut()}
            </kbd>
          </label>
        </Command>
      </div>
    </>
  );
}
