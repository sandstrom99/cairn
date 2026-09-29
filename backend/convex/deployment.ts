// deployment.ts: what this deployment knows about itself. `#push:cloud` records the commit
// it pushed the functions from as the deployment's `CAIRN_PUSHED_FROM`, `<sha>`, or
// `<sha>-dirty` when the functions carried uncommitted changes, and `cn doctor` compares
// it with the checkout it runs from, so a deployment running older functions than the `cn`
// calling it says so in one line rather than in a validator's error (docs/design.md §10).
// A deployment `#push:cloud` never reached, the anonymous local one and a throwaway among
// them, has none.
import { query } from "./lib/guard";

/** The environment, reached the way lib/guard.ts reaches it: the runtime is not Node. */
type MaybeProcess = { process?: { env?: Record<string, string | undefined> } };

export const pushedFrom = query({
  args: {},
  handler: async (): Promise<string | null> =>
    (globalThis as MaybeProcess).process?.env?.CAIRN_PUSHED_FROM || null,
});
