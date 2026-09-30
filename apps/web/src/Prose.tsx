// Prose.tsx: a passage people and agents wrote, as the page shows it. Markdown.tsx sets it,
// and that renderer is a quarter of the page's script, so it is not in the script the first
// screen waits on (cn-98). Its `import()` starts when this module runs, beside the page
// rather than before it, so a link opened cold to an issue has usually fetched it by the
// time the issue arrives. Until it has, a passage reads as written, line breaks kept; one
// that never arrives leaves it that way, and the page still reads.
//
// The renderer is a module variable read through useSyncExternalStore rather than
// React.lazy, whose first render suspends however long ago the import settled. Here a
// render after `typesetting` settles is set at once, so a test file that renders a page
// awaits it first and reads the page as a person does, never one way or the other by how
// fast the import happened to be.
import { type ReactNode, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type Passage = { text: string; className?: string };

/** The passage as written: what shows until the renderer is in, or if it never is. */
export function Written({ text, className }: Passage) {
  return (
    <div className={cn("max-w-[68ch] text-body break-words whitespace-pre-wrap", className)}>
      {text}
    </div>
  );
}

let typeset: ((passage: Passage) => ReactNode) | undefined;

/** Settles once the renderer is in, or once it failed to load and passages stay as written. */
export const typesetting: Promise<void> = import("./Markdown.tsx").then(
  (module) => {
    typeset = module.Markdown;
  },
  () => {},
);

const onTypeset = (changed: () => void) => {
  let live = true;
  void typesetting.then(() => live && changed());
  return () => {
    live = false;
  };
};
const current = () => typeset;

export function Prose(passage: Passage) {
  const Typeset = useSyncExternalStore(onTypeset, current, current) ?? Written;
  return <Typeset {...passage} />;
}
