// priority.ts: priority is 0 to 4, 0 highest and 4 backlog, matching beads (docs/design.md
// §12 says why). A create, an update and a follow-up each write one, and all three go
// through the one check here, so a fraction or a 5 is refused the same way wherever it
// arrives.
import { invalid } from "./errors";

/** The priority an issue gets when its create names none. */
export const DEFAULT_PRIORITY = 2;

/** 0 is highest, 4 is backlog, and nothing between is a fraction. */
export function checkPriority(priority: number): number {
  if (!Number.isInteger(priority) || priority < 0 || priority > 4)
    throw invalid(`priority ${priority} is not an integer 0 to 4, 0 highest`);
  return priority;
}
