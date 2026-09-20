// env.ts: a deployment's own environment variables, the switches that are set on the
// deployment rather than passed in a call. `CAIRN_OWNER` turns the reconcile sweep on
// (docs/design.md §7); lib/guard.ts reads `CAIRN_SECRET` the same way, inline, and keeps
// doing so because it is the one thing that must not depend on anything else.
//
// The Convex runtime is not Node and `convex/tsconfig.json` carries no node types, so the
// environment is reached through `globalThis` with its shape named here. Read on every
// call, never once at module load: a deployment's variables change under a running module.
type MaybeProcess = { process?: { env?: Record<string, string | undefined> } };

/** A variable from the deployment's environment; undefined when unset or empty. */
export function deploymentEnv(name: string): string | undefined {
  return (globalThis as MaybeProcess).process?.env?.[name] || undefined;
}
