// errors.ts: every ConvexError thrown anywhere carries `kind` and `message`. `cn` prints
// `message` and branches on `kind`, so an error that omits either is a broken contract.
import { ConvexError } from "convex/values";
import type { Actor } from "./actor";

/** No document with that public id. */
export const notFound = (id: string): ConvexError<{ kind: string; message: string }> =>
  new ConvexError({ kind: "not-found", message: `no such id ${id}` });

/** The arguments cannot make a valid document. */
export const invalid = (message: string): ConvexError<{ kind: string; message: string }> =>
  new ConvexError({ kind: "invalid", message });

/** The document is valid but the world already holds one like it. */
export const conflict = (message: string): ConvexError<{ kind: string; message: string }> =>
  new ConvexError({ kind: "conflict", message });

/**
 * Somebody else holds the claim. Claiming is first writer wins, so the second writer is
 * not told it is stale — it is told who holds it and since when, which is what it needs
 * to decide whether to wait, ask or take something else (docs/design.md §5).
 */
export const claimed = (doc: {
  id: string;
  claimedBy: Actor;
  claimedAt: number;
}): ConvexError<{
  kind: string;
  message: string;
  id: string;
  by: Actor;
  since: number;
}> =>
  new ConvexError({
    kind: "claimed",
    message: `${doc.id} is held by ${doc.claimedBy.name} since ${new Date(doc.claimedAt).toISOString()}`,
    id: doc.id,
    by: doc.claimedBy,
    since: doc.claimedAt,
  });
