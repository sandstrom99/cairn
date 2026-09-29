// tone.tsx: the one vocabulary for how a thing is doing, and the chroma each tone gets.
// Chroma means state (index.css): moving is teal, stuck is amber, waiting is violet, and
// still is grey with a hollow dot. Every dot and every coloured state word on the page is
// set from here; a status word in a list column that carries no chroma is IssueRows' own.
import type { EpicLineView } from "@cairn/cli/views";
import { cn } from "@/lib/utils";

export type Tone = "moving" | "stuck" | "waiting" | "still";

const TONE: Record<Tone, { dot: string; word: string }> = {
  moving: { dot: "bg-moving", word: "text-moving-ink" },
  stuck: { dot: "bg-stuck", word: "text-stuck-ink" },
  waiting: { dot: "bg-waiting", word: "text-waiting-ink" },
  still: { dot: "shadow-hollow", word: "text-slate" },
};

/** The tone a state word carries: cn's three names are their own, and every other word is still. */
export const toneOf = (word: string): Tone =>
  word === "moving" || word === "stuck" || word === "waiting" ? word : "still";

/**
 * The most pressing thing true of an epic, as its word: a person is needed, then silence,
 * then motion; with none of the three, "nothing moving" while it is open, else its status.
 * A line view carries no status and is an open epic.
 */
export function epicWord(epic: EpicLineView & { status?: string }): string {
  if (epic.health.waiting.length > 0) return "waiting";
  if (epic.health.stuck.length > 0) return "stuck";
  if (epic.health.moving.length > 0) return "moving";
  return epic.status === undefined || epic.status === "open" ? "nothing moving" : epic.status;
}

/** The dot alone: the one chroma the rail shows per epic. */
export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <i className={cn("size-2 shrink-0 rounded-full", TONE[tone].dot, className)} />;
}

/**
 * A state word in its tone, the dot before it. The tone is the word's own unless given,
 * and its colour goes last: a caller sets the size and the place, never the chroma.
 */
export function StateWord({
  word,
  tone = toneOf(word),
  className,
}: {
  word: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-[550]", className, TONE[tone].word)}>
      <Dot tone={tone} />
      {word}
    </span>
  );
}
