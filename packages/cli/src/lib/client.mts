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

import { api } from "@cairn/backend/convex/_generated/api.js";
import { ConvexHttpClient } from "convex/browser";
import { type Deployment, configPath, resolveDeployment } from "./config.mts";

export { api };

/** A client for one deployment. Cheap; nothing is opened until the first call. */
export const client = (url: string): ConvexHttpClient => new ConvexHttpClient(url);

/** The client for the deployment this machine resolves, or a message saying there is none. */
export function connect(env: NodeJS.ProcessEnv = process.env): {
  client: ConvexHttpClient;
  deployment: Deployment;
} {
  const deployment = resolveDeployment(env);
  if (!deployment) throw new Error(`no deployment: set CAIRN_URL, or write ${configPath(env)}`);
  return { client: client(deployment.url), deployment };
}
