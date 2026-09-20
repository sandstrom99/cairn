// crons.ts: everything cairn does on a clock, which is one thing — the reconcile sweep
// (docs/design.md §7). The registration is unconditional; whether the sweep acts is
// `reconcile.sweep`'s own decision, taken from the deployment's `CAIRN_OWNER`, so turning
// it on for a company is setting a variable rather than editing this file.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 04:00 UTC is before a working day starts in Europe, so the questions are waiting when
// people arrive.
crons.daily("reconcile sweep", { hourUTC: 4, minuteUTC: 0 }, internal.reconcile.sweep, {});

export default crons;
