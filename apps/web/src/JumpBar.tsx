// JumpBar.tsx: go to anything by its id or a piece of its title. It floats where a chat
// page would put its composer, and it only reads: the reference form is how work is named
// everywhere else, so typing one is how a reader gets to it. ⌘K or Ctrl K from anywhere.
//
// The matching and the keyboard are cmdk's, through shadcn's Command.
import type { Referable } from "@cairn/cli/ref";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { isId, navigate } from "./location.ts";
import { shortcut } from "./platform.ts";

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

export function JumpBar({
  destinations,
  side = true,
}: {
  destinations: Destination[];
  /** Whether a column stands on the right, which the bar centres itself clear of. */
  side?: boolean;
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
    <div
      className={cn(
        "pointer-events-none fixed bottom-[22px] left-(--main-left) z-30 flex justify-center px-10 narrow:left-0 narrow:px-4",
        side ? "right-(--main-right) mid:right-0" : "right-0",
      )}
    >
      <div className="under-bar absolute inset-x-0 bottom-[-22px] h-[132px]" />
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
                <span className="shrink-0 font-mono text-meta text-slate">{id}</span>
                <span className="truncate">{title}</span>
                <span className="ml-auto pl-3 text-meta whitespace-nowrap text-slate">{what}</span>
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
  );
}
