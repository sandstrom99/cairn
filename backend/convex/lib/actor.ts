// actor.ts: who did it. Stored inline wherever it appears rather than as a table,
// because until identity auth exists (docs/design.md §13) it is an argument `cn` fills
// in: `wsl/claude` with kind agent, `wsl/balder` with kind human.
//
// `session` is the Claude Code session the call came from, when it came from one: the
// SessionStart hook exports the session id and `cn` sends it. Every Claude session on a
// machine is the same `<host>/claude`, so the name alone cannot tell two parallel
// sessions apart, and after compaction cannot say which claim is this session's. The
// name stays stable so the log and `--mine` keep one actor; the session sits beside it.
// A human terminal sends none, and every event written before 2026-09-22 carries none.
import { v, type Infer } from "convex/values";

export const actorValidator = v.object({
  name: v.string(),
  kind: v.union(v.literal("human"), v.literal("agent")),
  session: v.optional(v.string()),
});

export type Actor = Infer<typeof actorValidator>;

/**
 * The same session: the same name from the same session, two absent sessions counting
 * as the same. A claim is idempotent on exactly this, and the brief marks an issue
 * `yours` on exactly this, so the two cannot disagree about whose a claim is.
 */
export const sameSession = (a: Actor, b: Actor): boolean =>
  a.name === b.name && a.session === b.session;

/** The actor reconcile writes as (§7), so its raises can be told apart; it lands in cn-7. */
export const RECONCILE: Actor = { name: "cairn/reconcile", kind: "agent" };
