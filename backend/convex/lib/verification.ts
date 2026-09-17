// verification.ts: what proves an issue done. A command and its output, not prose —
// prose is what an agent fabricates (docs/design.md §12). Proof that ran elsewhere goes
// in as an `evidence` journal entry and the close is the unverified shape pointing at it.
import { v, type Infer } from "convex/values";
import { actorValidator } from "./actor";

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
