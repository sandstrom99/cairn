// client.mts: the typed Convex client, and the generated `api` every verb calls through.
//
//   import { api, client } from "../lib/client.mts";
//   const issues = await client(dep.url).query(api.issues.list, { project: "app" });
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

export { api };

/** A client for one deployment. Cheap; nothing is opened until the first call. */
export const client = (url: string): ConvexHttpClient => new ConvexHttpClient(url);
