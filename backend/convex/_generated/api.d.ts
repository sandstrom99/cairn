/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as blockers from "../blockers.js";
import type * as brief from "../brief.js";
import type * as crons from "../crons.js";
import type * as edges from "../edges.js";
import type * as epics from "../epics.js";
import type * as events from "../events.js";
import type * as issues from "../issues.js";
import type * as journal from "../journal.js";
import type * as lib_actor from "../lib/actor.js";
import type * as lib_clock from "../lib/clock.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_followUp from "../lib/followUp.js";
import type * as lib_graph from "../lib/graph.js";
import type * as lib_guard from "../lib/guard.js";
import type * as lib_health from "../lib/health.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_inbox from "../lib/inbox.js";
import type * as lib_lifecycle from "../lib/lifecycle.js";
import type * as lib_lookup from "../lib/lookup.js";
import type * as lib_order from "../lib/order.js";
import type * as lib_priority from "../lib/priority.js";
import type * as lib_raise from "../lib/raise.js";
import type * as lib_readiness from "../lib/readiness.js";
import type * as lib_revision from "../lib/revision.js";
import type * as lib_thresholds from "../lib/thresholds.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_verification from "../lib/verification.js";
import type * as lib_views from "../lib/views.js";
import type * as projects from "../projects.js";
import type * as ready from "../ready.js";
import type * as reconcile from "../reconcile.js";
import type * as show from "../show.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  blockers: typeof blockers;
  brief: typeof brief;
  crons: typeof crons;
  edges: typeof edges;
  epics: typeof epics;
  events: typeof events;
  issues: typeof issues;
  journal: typeof journal;
  "lib/actor": typeof lib_actor;
  "lib/clock": typeof lib_clock;
  "lib/env": typeof lib_env;
  "lib/errors": typeof lib_errors;
  "lib/events": typeof lib_events;
  "lib/followUp": typeof lib_followUp;
  "lib/graph": typeof lib_graph;
  "lib/guard": typeof lib_guard;
  "lib/health": typeof lib_health;
  "lib/ids": typeof lib_ids;
  "lib/inbox": typeof lib_inbox;
  "lib/lifecycle": typeof lib_lifecycle;
  "lib/lookup": typeof lib_lookup;
  "lib/order": typeof lib_order;
  "lib/priority": typeof lib_priority;
  "lib/raise": typeof lib_raise;
  "lib/readiness": typeof lib_readiness;
  "lib/revision": typeof lib_revision;
  "lib/thresholds": typeof lib_thresholds;
  "lib/validators": typeof lib_validators;
  "lib/verification": typeof lib_verification;
  "lib/views": typeof lib_views;
  projects: typeof projects;
  ready: typeof ready;
  reconcile: typeof reconcile;
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
