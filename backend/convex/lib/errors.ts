// errors.ts: every ConvexError thrown anywhere carries `kind` and `message`. `cn` prints
// `message` and branches on `kind`, so an error that omits either is a broken contract.
//
// `CairnError` is that contract as a type. Every throw in the deployment goes through
// `cairnError`, which takes a member of the union and nothing else, so a shape that
// drifts fails the type check here rather than printing a placeholder in a terminal.
// `cn` imports the type alone (`errorData` in packages/cli/src/lib/cli.mts): a type-only
// import, erased at run time, so the CLI reads what came back by the same names.
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { Actor } from "./actor";
import type { Ref } from "./views";

/** One event since the revision a stale writer read: the row, `at` its creation time. */
export type SinceEvent = Pick<Doc<"events">, "revision" | "actor" | "kind" | "changes"> & {
  at: number;
};

/** Every shape a ConvexError from this deployment carries, told apart by `kind`. */
export type CairnError =
  /** No document with that public id, or no project with that slug. */
  | { kind: "not-found"; message: string }
  /** The arguments cannot make a valid document. */
  | { kind: "invalid"; message: string }
  /** The document is valid but the world already holds one like it. */
  | { kind: "conflict"; message: string }
  /** The deployment has a secret and the call did not match it (guard.ts). */
  | { kind: "unauthorized"; message: string }
  /** Somebody else holds the claim: who, and since when. */
  | { kind: "claimed"; message: string; id: string; by: Actor; since: number }
  /** The revision the writer read has moved: what it is now, and every event since (revision.ts). */
  | {
      kind: "stale";
      message: string;
      id: string;
      yours: number;
      current: number;
      since: SinceEvent[];
    }
  /** A create named no epic: the open ones it could go under (issues.ts). */
  | { kind: "epic-required"; message: string; candidates: Ref[] };

/** The member of `CairnError` with this `kind`. */
export type CairnErrorOf<K extends CairnError["kind"]> = Extract<CairnError, { kind: K }>;

/** The one way a ConvexError leaves this deployment: its data is a member of `CairnError`. */
export const cairnError = <E extends CairnError>(data: E): ConvexError<E> => new ConvexError(data);

/** No document with that public id. */
export const notFound = (id: string): ConvexError<CairnErrorOf<"not-found">> =>
  cairnError({ kind: "not-found", message: `no such id ${id}` });

/** No project with that slug. A slug is not an id, so the message does not call it one. */
export const projectNotFound = (slug: string): ConvexError<CairnErrorOf<"not-found">> =>
  cairnError({ kind: "not-found", message: `no such project ${slug}` });

/** The arguments cannot make a valid document. */
export const invalid = (message: string): ConvexError<CairnErrorOf<"invalid">> =>
  cairnError({ kind: "invalid", message });

/** The document is valid but the world already holds one like it. */
export const conflict = (message: string): ConvexError<CairnErrorOf<"conflict">> =>
  cairnError({ kind: "conflict", message });

/**
 * Somebody else holds the claim. Claiming is first writer wins, so the second writer is
 * not told it is stale — it is told who holds it and since when, which is what it needs
 * to decide whether to wait, ask or take something else (docs/design.md §5).
 */
export const claimed = (
  doc: {
    id: string;
    claimedBy: Actor;
    claimedAt: number;
  },
  /** The asker has the holder's name: another session of it holds the claim. */
  sameName = false,
): ConvexError<CairnErrorOf<"claimed">> =>
  cairnError({
    kind: "claimed",
    message: `${doc.id} is held by ${doc.claimedBy.name}${sameName ? " in another session" : ""} since ${new Date(doc.claimedAt).toISOString()}`,
    id: doc.id,
    by: doc.claimedBy,
    since: doc.claimedAt,
  });

/** The revision the writer read has moved: what it is now, and every event since. */
export const stale = (
  doc: { id: string; revision: number },
  yours: number,
  since: SinceEvent[],
): ConvexError<CairnErrorOf<"stale">> =>
  cairnError({
    kind: "stale",
    message: `${doc.id} is at revision ${doc.revision}, you read ${yours}`,
    id: doc.id,
    yours,
    current: doc.revision,
    since,
  });

/** A create named no epic: the open ones it could go under. */
export const epicRequired = (candidates: Ref[]): ConvexError<CairnErrorOf<"epic-required">> =>
  cairnError({ kind: "epic-required", message: "an issue needs an epic", candidates });
