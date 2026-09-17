// verification.ts: what proves an issue done. A command and its output, not prose —
// prose is what an agent fabricates (docs/design.md §12). Proof that ran elsewhere goes
// in as an `evidence` journal entry and the close is the unverified shape pointing at it.
import { v, type Infer } from "convex/values";
import { actorValidator } from "./actor";

/**
 * What a caller sends: the command it ran and what that command said, or the unverified
 * shape and why. `at` and `by` are not the caller's to claim — the deployment stamps them
 * when it stores the record, so a close can never be dated or attributed by the writer.
 */
export const verificationInputValidator = v.union(
  v.object({
    command: v.string(),
    exitCode: v.number(),
    output: v.string(),
  }),
  v.object({
    unverified: v.string(),
  }),
);

export type VerificationInput = Infer<typeof verificationInputValidator>;

export const verificationValidator = v.union(
  v.object({
    command: v.string(),
    exitCode: v.number(),
    output: v.string(),
    at: v.number(),
    by: actorValidator,
  }),
  v.object({
    unverified: v.string(),
    at: v.number(),
    by: actorValidator,
  }),
);

export type Verification = Infer<typeof verificationValidator>;
