// actor.ts: who did it. Stored inline wherever it appears rather than as a table,
// because until identity auth exists (docs/design.md §13) it is an argument `cn` fills
// in: `wsl/claude` with kind agent, `wsl/balder` with kind human.
import { v, type Infer } from "convex/values";

export const actorValidator = v.object({
  name: v.string(),
  kind: v.union(v.literal("human"), v.literal("agent")),
});

export type Actor = Infer<typeof actorValidator>;

/** The actor reconcile writes as (§7), so its raises can be told apart; it lands in cn-7. */
export const RECONCILE: Actor = { name: "cairn/reconcile", kind: "agent" };
