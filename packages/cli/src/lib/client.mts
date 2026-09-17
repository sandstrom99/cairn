// client.mts: the typed Convex client, and the generated `api` every verb calls through.
//
//   import { api, connect } from "../lib/client.mts";
//   const { client } = connect();
//   const issues = await client.query(api.issues.list, { project: "app" });
//
// `api` comes from @cairn/backend's generated code, so a verb whose arguments drift from
// the function's validator fails `vp check`, not the agent. This is the whole reason the
// CLI holds the Convex communication rather than an MCP server in between: the types
// flow from the schema to the verb with nothing to keep in sync by hand.
//
// A second consumer — a web app, an MCP wrapper — imports this module. It lifts into
// its own package when that consumer exists, not before.
//
// The deployment's shared secret rides on every call, added here and nowhere else, so no
// verb knows it exists. The deployment checks it in `lib/guard.ts` and strips it before
// its handler (docs/design.md §12). With no secret resolved the arguments go through
// untouched, with no `secret` key at all, which is what the anonymous local deployment
// and any test against it see.

import { api } from "@cairn/backend/convex/_generated/api.js";
import { ConvexHttpClient } from "convex/browser";
import { type Deployment, configPath, resolveDeployment } from "./config.mts";

export { api };

/** What a verb calls: the two methods of `ConvexHttpClient`, with their types. */
export type CairnClient = {
  query: ConvexHttpClient["query"];
  mutation: ConvexHttpClient["mutation"];
};

/** A client for one deployment. Cheap; nothing is opened until the first call. */
export const client = (url: string): ConvexHttpClient => new ConvexHttpClient(url);

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

/** The client for the deployment this machine resolves, or a message saying there is none. */
export function connect(env: NodeJS.ProcessEnv = process.env): {
  client: CairnClient;
  deployment: Deployment;
} {
  const deployment = resolveDeployment(env);
  if (!deployment) throw new Error(`no deployment: set CAIRN_URL, or write ${configPath(env)}`);
  return { client: withSecret(client(deployment.url), deployment.secret), deployment };
}
