// brief.ts: the page's headline, which is `cn brief` said as a sentence. The same three
// counts in a fixed order: what waits on a person first, because that is the one only the
// reader can move, then what is in progress, then what is ready. The order never changes
// with the numbers, so it is learnt once; a clause with nothing behind it is marked
// `empty` and the page sets it back, so the ink on the screen is what is actually there.
import type { BriefView } from "@cairn/cli/views";

export type Clause = { text: string; empty: boolean };

const clause = (count: number, some: string, none: string): Clause =>
  count === 0 ? { text: none, empty: true } : { text: `${count} ${some}`, empty: false };

export function headline(view: BriefView): Clause[] {
  return [
    clause(view.waiting, "waiting on you.", "Nothing waiting on you."),
    clause(view.inProgress.length, "in progress.", "Nothing in progress."),
    clause(view.ready.count, "ready.", "Nothing ready."),
  ];
}

/**
 * The line under it: follow-ups, and how many of them ask for something particular of the
 * session that picks them up. Nothing to say is no line at all.
 */
export function underline(view: BriefView): string | undefined {
  const said: string[] = [];
  const { count, covered } = view.followUps;
  if (count > 0) {
    const asking = count - covered.length;
    const noun = count === 1 ? "follow-up" : "follow-ups";
    said.push(asking > 0 ? `${count} ${noun}, ${asking} with requirements.` : `${count} ${noun}.`);
  }
  return said.length > 0 ? said.join(" ") : undefined;
}
