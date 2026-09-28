// testing.mts: the fixtures every test builds from, declared once, for this package's
// tests and the web's through `@cairn/cli/testing`. A clock that never moves and the
// spans ages are read against, one actor of each kind, a builder per view the deployment
// answers with, and the temp config homes the file tests need, removed after each test.
//
// A builder is typed as the view it builds, so a test says only what it varies and
// never casts: `issue({ status: "closed", closedAt: ago(HOUR) })` is a ShownIssue, and a
// field the deployment stops answering with is a type error here, not a fixture that
// quietly kept it.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import type { BriefView, LogEvent, ShownBlocker, ShownEpic, ShownIssue } from "./views.mts";
import { DAY, HOUR, MINUTE } from "./time.mts";

/** Noon UTC on 2026-09-21, the day the web window was settled. Every age is read against it. */
export const now = Date.UTC(2026, 8, 21, 12, 0);
/** The units every age here is built from, spelled once in time.mts and re-exported for tests. */
export { DAY, HOUR, MINUTE };
/** `ms` before `now`. */
export const ago = (ms: number): number => now - ms;

/** This machine's session and the person at its terminal (docs/design.md §12). */
export const agent = { name: "wsl/claude", kind: "agent" } as const;
export const human = { name: "wsl/balder", kind: "human" } as const;

/** What `cn show cn-1` answers: open, unclaimed, an hour quiet, a two-line design, nothing around it. */
export function issue(over: Partial<ShownIssue> = {}): ShownIssue {
  return {
    kind: "issue",
    id: "cn-1",
    project: "cn",
    epic: { id: "ep-1", title: "Create to close" },
    title: "schema, ids, revision, events",
    description: undefined,
    design: "transcribe §3\nthen the functions",
    acceptance: undefined,
    type: "task",
    followUpKind: undefined,
    parent: undefined,
    requires: [],
    links: undefined,
    status: "open",
    priority: 0,
    claimedBy: undefined,
    claimedAt: undefined,
    lastActivity: ago(HOUR),
    deferUntil: undefined,
    verification: undefined,
    droppedReason: undefined,
    closedAt: undefined,
    revision: 0,
    createdAt: ago(2 * HOUR),
    stuck: false,
    journal: [],
    blocks: [],
    blockedBy: [],
    related: [],
    discoveredFrom: [],
    duplicates: [],
    supersedes: [],
    waitingOn: [],
    followUps: [],
    events: undefined,
    ...over,
  };
}

/** What `cn show ep-1` answers: open, a day old, nothing under it. */
export function epic(over: Partial<ShownEpic> = {}): ShownEpic {
  return {
    kind: "epic",
    id: "ep-1",
    title: "Create to close",
    description: undefined,
    links: undefined,
    status: "open",
    droppedReason: undefined,
    revision: 0,
    createdAt: ago(DAY),
    lastActivity: ago(DAY),
    counts: { open: 0, inProgress: 0, closed: 0, dropped: 0, followUps: 0 },
    health: { moving: [], stuck: undefined, waiting: [] },
    issues: [],
    ...over,
  };
}

/** What `cn show bl-1` answers: raised two hours ago by this session, holding nothing yet. */
export function blocker(over: Partial<ShownBlocker> = {}): ShownBlocker {
  return {
    kind: "blocker",
    id: "bl-1",
    title: "the App Store agreement",
    blockerKind: "approval",
    owner: "balder",
    whatResolves: "accept it in App Store Connect",
    links: undefined,
    nudgeAt: undefined,
    status: "raised",
    raisedBy: agent,
    raisedAt: ago(2 * HOUR),
    resolvedBy: undefined,
    resolvedAt: undefined,
    resolution: undefined,
    revision: 0,
    issues: [],
    events: undefined,
    ...over,
  };
}

/** One row of `cn log`: cn-1's create, an hour ago, by this session. */
export function logEvent(over: Partial<LogEvent> = {}): LogEvent {
  return {
    at: ago(HOUR),
    actor: agent,
    kind: "issue.create",
    revision: 0,
    changes: undefined,
    issue: { id: "cn-1", title: "schema, ids, revision, events" },
    epic: undefined,
    blocker: undefined,
    ...over,
  };
}

/** What `cn brief` answers on a deployment where nothing is happening. */
export function briefView(over: Partial<BriefView> = {}): BriefView {
  return {
    ready: { count: 0, top: [] },
    inProgress: [],
    followUps: { count: 0, covered: [] },
    waiting: 0,
    ...over,
  };
}

/** Every config home a test made, removed after it whatever it did. */
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** An empty directory to point XDG_CONFIG_HOME at, gone after the test. */
export function tempHome(prefix = "cairn-test-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/** An environment whose config home holds `body` as cairn/config.json, gone after the test. */
export function tempConfig(body: unknown, prefix = "cairn-test-"): NodeJS.ProcessEnv {
  const home = tempHome(prefix);
  mkdirSync(join(home, "cairn"));
  writeFileSync(join(home, "cairn", "config.json"), JSON.stringify(body));
  return { XDG_CONFIG_HOME: home };
}
