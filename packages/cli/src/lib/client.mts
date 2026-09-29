// client.mts: the typed Convex client, and the generated `api` every verb calls through.
//
//   import { api, connect } from "../lib/client.mts";
//   const { client, actor } = connect();
//   const issues = await client.query(api.issues.list, { project: "app" });
//
// `connect()` is the session of lib/session.mts, read once, with the client for the
// deployment it resolved: a verb takes the client and the actor from one call and reads
// nothing else, and with no deployment it fails with the one sentence that names `cn init`.
//
// `api` comes from @cairn/backend's generated code, so a verb whose arguments drift from
// the function's validator fails `vp check`, not the agent. This is the whole reason the
// CLI holds the Convex communication rather than an MCP server in between: the types
// flow from the schema to the verb with nothing to keep in sync by hand.
//
// The second consumer, apps/web, arrived on 2026-09-20 and did not need this module: a
// page subscribes through convex/react and takes `api` from @cairn/backend by name, and
// what it shares with cn is the lines, through the exports map. So this stays the CLI's
// own; an MCP wrapper would be the consumer that lifts it, and there is none (§10).
//
// The deployment's shared secret rides on every call, added here and nowhere else, so no
// verb knows it exists. The deployment checks it in `lib/guard.ts` and strips it before
// its handler (docs/design.md §12). With no secret resolved the arguments go through
// untouched, with no `secret` key at all, which is what the anonymous local deployment
// and any test against it see.
//
// A call the deployment refuses because it runs other functions than this cn, an argument
// its validator does not know or lacks, or a function it does not have, is rethrown here
// as the one line lib/pushed.mts makes of it, naming the deployment and the fix, in place
// of Convex's multi-line error. The original rides on the new error as its `cause`. A
// ConvexError is the deployment's own answer and passes through untouched, as does
// anything else.

import { api } from "@cairn/backend/convex/_generated/api.js";
import { ConvexHttpClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { type Deployment, noDeploymentMessage } from "./config.mts";
import { checkoutRoot, mismatchLine } from "./pushed.mts";
import { type Session, session } from "./session.mts";

export { api };

/** What a verb calls: the two methods of `ConvexHttpClient`, with their types. */
export type CairnClient = {
  query: ConvexHttpClient["query"];
  mutation: ConvexHttpClient["mutation"];
};

/** A client for one deployment. Cheap; nothing is opened until the first call. */
const client = (url: string): ConvexHttpClient => new ConvexHttpClient(url);

/**
 * `http` with the deployment's secret spread into the arguments of every call, or `http`
 * itself when there is no secret to send.
 */
export function withSecret(http: CairnClient, secret?: string): CairnClient {
  if (secret === undefined) return http;
  // The generated signatures take the function's own arguments, so the one extra key is
  // added on the way past and the call is re-typed as what it was.
  const carry = (args: unknown[]): never =>
    [{ ...(args[0] as Record<string, unknown>), secret }] as never;
  return {
    query: (fn, ...args) => http.query(fn, ...carry(args)),
    mutation: (fn, ...args) => http.mutation(fn, ...carry(args)),
  };
}

/**
 * `http` with every plain error that means the deployment runs other functions than this
 * cn rethrown as the one line naming `dep` and the fix; every other error untouched.
 */
export function explained(http: CairnClient, dep: Deployment, root: string): CairnClient {
  const explain =
    (fn: string) =>
    (e: unknown): never => {
      if (e instanceof Error && !(e instanceof ConvexError)) {
        const line = mismatchLine(e.message, dep, root, fn);
        if (line !== null) throw new Error(line, { cause: e });
      }
      throw e;
    };
  return {
    query: (fn, ...args) => http.query(fn, ...args).catch(explain(getFunctionName(fn))),
    mutation: (fn, ...args) => http.mutation(fn, ...args).catch(explain(getFunctionName(fn))),
  };
}

/**
 * A client for a deployment named outright, rather than one the config resolves: what
 * `cn init` checks against, since the deployment it was given is not in the file yet. A
 * target with no name is named by its URL, as one CAIRN_URL chose is.
 */
export function connectTo(target: {
  url: string;
  secret?: string;
  name?: string;
  source?: Deployment["source"];
}): CairnClient {
  const dep: Deployment =
    target.name === undefined
      ? { name: "CAIRN_URL", url: target.url, source: "CAIRN_URL" }
      : { name: target.name, url: target.url, source: target.source ?? "default" };
  return explained(withSecret(client(target.url), target.secret), dep, checkoutRoot());
}

/** A session that resolved a deployment, with the client for it. */
type Connected = Session & { deployment: Deployment; client: CairnClient };

/** This call's session and the client for its deployment, or the one sentence saying there is none. */
export function connect(env: NodeJS.ProcessEnv = process.env): Connected {
  const s = session(env);
  if (!s.deployment) throw new Error(noDeploymentMessage());
  return { ...s, deployment: s.deployment, client: connectTo(s.deployment) };
}
