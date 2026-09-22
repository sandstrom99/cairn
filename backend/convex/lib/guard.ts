// guard.ts: the one shared secret that fences a deployment (docs/design.md §12, §13).
//
//   import { mutation, query } from "./lib/guard";
//
// Every public function is declared through these instead of the ones `_generated/server`
// exports. They add an optional `secret` argument to the validator, compare it to the
// deployment's `CAIRN_SECRET`, and **strip it before the handler runs**, so no handler,
// no event and no `createdChanges` ever sees it.
//
// It fences a deployment, not an actor: it says this caller may talk to this deployment
// at all, and nothing about who is calling. Telling actors apart is identity auth, which
// arrives with `apps/web` (§13); until then the actor is still an argument `cn` sends.
//
// **No `CAIRN_SECRET` on the deployment means nothing is checked.** The anonymous local
// deployment has no environment to set one in, and every test runs against a bare
// `convexTest`, so an absent variable has to be the open case rather than a locked door.
// A cloud deployment sets it once and every call carries it from that moment on.
import { type ObjectType, type PropertyValidators, v } from "convex/values";
import {
  type MutationCtx,
  type QueryCtx,
  mutation as rawMutation,
  query as rawQuery,
} from "../_generated/server";
import { cairnError } from "./errors";

const secretArg = { secret: v.optional(v.string()) };

/**
 * The deployment's `CAIRN_SECRET`, or undefined where the runtime has no `process`.
 * The Convex runtime is not Node and `convex/tsconfig.json` carries no node types, so
 * the environment is reached through `globalThis` with its shape named here, and read on
 * every call rather than once at module load.
 */
type MaybeProcess = { process?: { env?: Record<string, string | undefined> } };
const expected = (): string | undefined =>
  (globalThis as MaybeProcess).process?.env?.CAIRN_SECRET || undefined;

/** Throws `unauthorized` when the deployment has a secret and the call did not match it. */
export function check(secret: string | undefined): void {
  const want = expected();
  if (want === undefined) return;
  if (secret !== want)
    throw cairnError({
      kind: "unauthorized",
      message:
        "this deployment needs a secret it did not get: put it under the deployment's `secret` in ~/.config/cairn/config.json, or set CAIRN_SECRET",
    });
}

/** A public mutation, fenced by the deployment's secret. */
export const mutation = <Args extends PropertyValidators, Out>(fn: {
  args: Args;
  handler: (ctx: MutationCtx, args: ObjectType<Args>) => Promise<Out>;
}) =>
  rawMutation({
    args: { ...fn.args, ...secretArg },
    handler: async (ctx, { secret, ...args }) => {
      check(secret);
      return await fn.handler(ctx, args as ObjectType<Args>);
    },
  });

/** A public query, fenced by the deployment's secret. */
export const query = <Args extends PropertyValidators, Out>(fn: {
  args: Args;
  handler: (ctx: QueryCtx, args: ObjectType<Args>) => Promise<Out>;
}) =>
  rawQuery({
    args: { ...fn.args, ...secretArg },
    handler: async (ctx, { secret, ...args }) => {
      check(secret);
      return await fn.handler(ctx, args as ObjectType<Args>);
    },
  });
