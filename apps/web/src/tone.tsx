// tone.tsx: the one vocabulary for how a thing is doing, and the chroma each tone gets.
// Chroma means state (index.css): moving is teal, stuck is amber, waiting is violet, and
// still is grey with a hollow dot. Every dot and every coloured state word on the page is
// set from here; a status word in a list column that carries no chroma is IssueRows' own.
import type { EpicLineView, ProjectView } from "@cairn/cli/views";
import { cn } from "@/lib/utils";

export type Tone = "moving" | "stuck" | "waiting" | "still";

const TONE: Record<Tone, { dot: string; word: string }> = {
  moving: { dot: "bg-moving", word: "text-moving-ink" },
  stuck: { dot: "bg-stuck", word: "text-stuck-ink" },
  waiting: { dot: "bg-waiting", word: "text-waiting-ink" },
  still: { dot: "shadow-hollow", word: "text-slate" },
};

/** The text class a tone sets a word in, alone: for a tinted word inside a sentence. */
export const toneText = (tone: Tone): string => TONE[tone].word;

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

/**
 * The most pressing thing true of a project, as its word: waiting, stuck, moving; else
 * "nothing filed" where nothing ever was, or "nothing moving".
 */
export function projectWord(project: ProjectView): string {
  if (project.health.waiting.length > 0) return "waiting";
  if (project.health.stuck.length > 0) return "stuck";
  if (project.health.moving.length > 0) return "moving";
  return project.filed === 0 ? "nothing filed" : "nothing moving";
}

/** A priority as a badge: P0 heaviest, P4 faintest, by lightness alone, since chroma means state. */
const PRIORITY: Record<string, string> = {
  P0: "bg-ink text-paper",
  P1: "bg-ink/16 text-ink",
  P2: "bg-ink/9 text-ink",
  P3: "bg-ink/5 text-slate",
  P4: "bg-ink/4 text-faint",
};

/** cn's priority token, `P2`, as a badge; a token the page does not know is set as it is. */
export function Priority({ token, className }: { token: string; className?: string }) {
  const badge = PRIORITY[token];
  if (badge === undefined) return <span className={className}>{token}</span>;
  return (
    <b className={cn("rounded-[5px] px-1.5 py-px font-mono font-[650]", badge, className)}>
      {token}
    </b>
  );
}

/** The dot alone: the one chroma the rail shows per epic. */
export function Dot({
  tone,
  className,
  title,
}: {
  tone: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <i className={cn("size-2 shrink-0 rounded-full", TONE[tone].dot, className)} title={title} />
  );
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
