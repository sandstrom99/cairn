/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as epics from "../epics.js";
import type * as issues from "../issues.js";
import type * as journal from "../journal.js";
import type * as lib_actor from "../lib/actor.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_inbox from "../lib/inbox.js";
import type * as lib_revision from "../lib/revision.js";
import type * as lib_verification from "../lib/verification.js";
import type * as lib_views from "../lib/views.js";
import type * as projects from "../projects.js";
import type * as show from "../show.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  epics: typeof epics;
  issues: typeof issues;
  journal: typeof journal;
  "lib/actor": typeof lib_actor;
  "lib/errors": typeof lib_errors;
  "lib/events": typeof lib_events;
  "lib/ids": typeof lib_ids;
  "lib/inbox": typeof lib_inbox;
  "lib/revision": typeof lib_revision;
  "lib/verification": typeof lib_verification;
  "lib/views": typeof lib_views;
  projects: typeof projects;
  show: typeof show;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
