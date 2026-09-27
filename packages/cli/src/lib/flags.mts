// flags.mts: what a flag's value has to be, decided once. parseArgs hands a verb its
// flags as strings; whether a string is an integer revision, a priority from 0 to 4, a
// date, or one of the words a flag takes is settled here, in one wording per shape, so
// `--revision=` is refused rather than read as 0 and every verb says "is one of" the
// same way. Each helper reads `undefined` as "not given" and hands it back, so a verb
// spreads the result through `maybe` and a required flag goes through `need`.
//
// The word lists are the deployment's, checked against its own types: a word missing
// from a validator is a type error here, not a refusal at run time.

import { readFileSync } from "node:fs";
import type { LinkInput } from "@cairn/backend/convex/lib/links.js";
import type {
  BlockerKind,
  FollowUpKind,
  IssueStatus,
  IssueType,
  JournalKind,
} from "@cairn/backend/convex/lib/validators.js";
import { UsageError } from "./cli.mts";
import { DAY, HOUR, MINUTE } from "./time.mts";

export const ISSUE_TYPES = ["task", "follow-up"] as const satisfies readonly IssueType[];
export const FOLLOW_UP_KINDS = [
  "verify",
  "decide",
  "cleanup",
] as const satisfies readonly FollowUpKind[];
export const ISSUE_STATUSES = [
  "open",
  "in_progress",
  "closed",
  "dropped",
] as const satisfies readonly IssueStatus[];
export const BLOCKER_KINDS = [
  "approval",
  "external-wait",
  "decision",
  "credential",
  "purchase",
] as const satisfies readonly BlockerKind[];
export const JOURNAL_KINDS = [
  "finding",
  "decision",
  "handoff",
  "evidence",
  "question",
] as const satisfies readonly JournalKind[];

/** `{ epic: "ep-1" }` or `{}`: an absent option is an absent key, never an undefined one. */
export const maybe = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

/** A flag the verb cannot go without: absent, the usage line is the error. */
export function need<V>(value: V | undefined, usage: string): V {
  if (value === undefined) throw new UsageError(usage);
  return value;
}

/** The one positional an id-taking verb reads: not none, and not two. */
export function onlyId(pos: string[], usage: string): string {
  const [id, ...rest] = pos;
  if (!id || rest.length > 0) throw new UsageError(usage);
  return id;
}

/**
 * A verb that takes flags only: a positional is a flag the caller forgot to name, and
 * it is refused by name rather than run past. `cn ready ios` means `cn ready --can ios`.
 */
export function onlyFlags(pos: string[], usage: string): void {
  if (pos.length > 0) throw new UsageError(`${usage}: takes flags only, and got "${pos[0]}"`);
}

/** An integer, or nothing: `Number("")` and `Number(" ")` are 0, so a blank is not one. */
const whole = (given: string): number | undefined => {
  const n = given.trim() === "" ? NaN : Number(given);
  return Number.isInteger(n) ? n : undefined;
};

/** `--limit 50`: a whole number from `min` to `max`, where given. */
export function integer(
  given: string | undefined,
  flag: string,
  min: number,
  max: number,
): number | undefined {
  if (given === undefined) return undefined;
  const n = whole(given);
  if (n === undefined || n < min || n > max)
    throw new UsageError(`--${flag} is a whole number from ${min} to ${max}, not "${given}"`);
  return n;
}

/** `--priority 2`: 0 to 4, where given. */
export const priority = (given: string | undefined): number | undefined =>
  integer(given, "priority", 0, 4);

/** `--revision N`, the revision cn last printed for it. Required, and `--revision=` is not 0. */
export function revision(given: string | undefined, usage: string): number {
  const n = given === undefined ? undefined : whole(given);
  if (n === undefined) throw new UsageError(`${usage}: the revision cn last printed for it`);
  return n;
}

/** `--nudge 2026-10-01`: anything Date.parse takes, as a timestamp, where given. */
export function date(given: string | undefined, flag: string): number | undefined {
  if (given === undefined) return undefined;
  const at = Date.parse(given);
  if (Number.isNaN(at)) throw new UsageError(`--${flag} is a date, as YYYY-MM-DD, not "${given}"`);
  return at;
}

/**
 * `--link https://…` or `--link '[label](https://…)'`, the Markdown form, where given. The
 * label's trimming and every check of the URL are the deployment's: which schemes a link
 * may have is decided there, once.
 */
export function links(given: string[] | undefined): LinkInput[] | undefined {
  if (given === undefined) return undefined;
  if (given.length === 0) throw new UsageError("--link needs a URL, or [label](url)");
  return given.map((raw) => {
    const value = raw.trim();
    if (value === "") throw new UsageError("--link needs a URL, or [label](url)");
    const m = /^\[(.*)\]\((.+)\)$/.exec(value);
    return m ? { url: m[2]!.trim(), label: m[1]! } : { url: value };
  });
}

/** `--unlink https://…`: each URL trimmed, where given, and none of them blank. */
export function urls(given: string[] | undefined, flag: string): string[] | undefined {
  if (given === undefined) return undefined;
  if (given.length === 0) throw new UsageError(`${flag} needs a URL`);
  return given.map((raw) => {
    const value = raw.trim();
    if (value === "") throw new UsageError(`${flag} needs a URL`);
    return value;
  });
}

/** What a text value is read through: the real stdin and filesystem, or a test's stand-ins. */
export type TextIo = {
  stdin: () => string;
  file: (path: string) => string;
  interactive: () => boolean;
};

const IO: TextIo = {
  stdin: () => readFileSync(0, "utf8"),
  file: (path) => readFileSync(path, "utf8"),
  interactive: () => process.stdin.isTTY === true,
};

/** The most a text may be, in bytes: a body past this is a file, not a field. */
export const TEXT_MAX_BYTES = 64 * 1024;

/**
 * `--design @notes.md`, `cn journal … @-`: a value that starts with `@` names where the
 * text is, `-` for stdin and anything else a file, so a multi-line body never passes
 * through shell quoting, which is where agents mangle it. Any other value is the text
 * itself. `what` is how the refusal names the value: `--design`, or `the body`.
 */
export function text(given: string | undefined, what: string, io: TextIo = IO): string | undefined {
  if (given === undefined) return undefined;
  const value = given.startsWith("@") ? read(given.slice(1), what, io) : given;
  // Counted in bytes, as a stored document is, and refused before anything connects: a
  // body this long is a file to point at, not a field to read in a terminal.
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes > TEXT_MAX_BYTES)
    throw new UsageError(
      `${what} is ${Math.ceil(bytes / 1024)} KiB, over the 64 KiB a text may be`,
    );
  return value;
}

/** Where an `@` value points: stdin for `-`, a file for anything else, an empty name included. */
function read(path: string, what: string, io: TextIo): string {
  if (path === "-") {
    // A terminal with nothing piped would wait on a read nobody means to answer.
    if (io.interactive()) throw new UsageError(`${what} @- reads stdin, and nothing is piped in`);
    return io.stdin();
  }
  try {
    return io.file(path);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw new UsageError(`${what} @${path}: cannot read ${path}${code ? ` (${code})` : ""}`);
  }
}

/** The unit a duration's letter names, spelled with the day the rest of cn prints. */
const UNITS: Record<string, number> = { m: MINUTE, h: HOUR, d: DAY };

/** `--silent 3d`: a count and a unit, `90m`, `36h` or `3d`, as milliseconds, where given. */
export function duration(given: string | undefined, flag: string): number | undefined {
  if (given === undefined) return undefined;
  const match = /^(\d+)([mhd])$/.exec(given);
  if (!match) throw new UsageError(`--${flag} is a duration, as 90m, 36h or 3d, not "${given}"`);
  return Number(match[1]) * UNITS[match[2]!]!;
}

/** `--kind finding`: one of the words the flag takes, where given. */
export function oneOf<const W extends readonly string[]>(
  given: string | undefined,
  flag: string,
  words: W,
): W[number] | undefined {
  if (given === undefined) return undefined;
  if (!(words as readonly string[]).includes(given))
    throw new UsageError(`--${flag} is one of ${words.join(", ")}, not "${given}"`);
  return given as W[number];
}
