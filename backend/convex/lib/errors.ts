// errors.ts: every ConvexError thrown anywhere carries `kind` and `message`. `cn` prints
// `message` and branches on `kind`, so an error that omits either is a broken contract.
import { ConvexError } from "convex/values";

/** No document with that public id. */
export const notFound = (id: string): ConvexError<{ kind: string; message: string }> =>
  new ConvexError({ kind: "not-found", message: `no such id ${id}` });

/** The arguments cannot make a valid document. */
export const invalid = (message: string): ConvexError<{ kind: string; message: string }> =>
  new ConvexError({ kind: "invalid", message });

/** The document is valid but the world already holds one like it. */
export const conflict = (message: string): ConvexError<{ kind: string; message: string }> =>
  new ConvexError({ kind: "conflict", message });
