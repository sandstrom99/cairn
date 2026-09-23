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
import { navigate } from "./location.ts";

/** Something the bar can go to, and the word that says what it is. */
export type Destination = Referable & { what: string };

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
        "pointer-events-none fixed bottom-[22px] left-[276px] z-30 flex justify-center px-10 max-[720px]:left-0 max-[720px]:px-4",
        side ? "right-[396px] max-[1100px]:right-0" : "right-0",
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
            {destinations.map(({ id, title, what }) => (
              <CommandItem
                key={id}
                value={`${id} ${title}`}
                onSelect={() => {
                  navigate(`/${id}`);
                  setTerm("");
                  input.current?.blur();
                }}
                className="gap-1.5 rounded-xl px-3 py-[9px] text-[0.875rem] data-selected:bg-white/75 [&>svg:last-child]:hidden"
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
          <kbd className="rounded-[7px] bg-white/70 px-[7px] py-[3px] font-mono text-xs text-slate shadow-[0_0_0_1px_rgb(21_24_30/0.07)]">
            ⌘K
          </kbd>
        </label>
      </Command>
    </div>
  );
}
