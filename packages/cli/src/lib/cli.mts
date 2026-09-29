// cli.mts: the shell every verb runs in, written once, trimmed to what cn needs.
//
//   import { UsageError, answer, errorData, fail, main, say, warn } from "../lib/cli.mts";
//
// `main(fn)` runs the CLI body with `process.argv.slice(2)` and owns the exit arms: a
// UsageError prints `✗ usage: …` and exits 2, a ConvexError prints the message the
// deployment wrote and exits 1 — and a stale one also prints every change since the
// revision the caller read, and the `cn show` and `--revision` to retry with — any other
// error prints `✗ …` and exits 1, and a number returned by `fn` is the exit code. It sets
// `process.exitCode` and never calls `process.exit()`: a pipe takes a large write
// asynchronously, and an exit right after it cuts the output at 64 KB.
//
// `answer(json, value, toLines)` is a read verb's answer on stdout: the value as JSON
// under --json, else its lines, and nothing at all when there are none. `fail(line)` is
// the one `✗ …` line a verb refuses with, on stderr, handed back as the exit code to
// return; `checkLine(ok, line)` is the `✓ …` or `✗ …` a check prints, for the two verbs
// whose answer is a list of checks. `errorData(e)` is what a ConvexError from the
// deployment carries, typed as the deployment's own `CairnError` union, for the verb that
// answers one kind itself.
//
// `say` and `warn` write one line to stderr with the `·` and `!` prefixes; stdout stays
// for the answer, so `cn … --json | jq` is always clean. `usageFromHeader(url)` is the
// leading `//` comment block of a file, the way every verb documents itself: the file
// header is the --help text, and main.mts prints it for `cn <verb> --help`.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CairnError } from "@cairn/backend/convex/lib/errors.js";
import { ConvexError } from "convex/values";
import { staleLines } from "./lines.mts";

/** Wrong arguments: exit 2 at the top of a CLI. */
export class UsageError extends Error {}

export const say = (msg: string): void => console.error(`· ${msg}`);
export const warn = (msg: string): void => console.error(`! ${msg}`);

/**
 * A read verb's answer, on stdout. Under --json the value, as it came from the
 * deployment, so `[]` is printed and a pipe always reads valid JSON; otherwise the lines
 * `toLines` makes of it, joined, and nothing when there are none, so an empty list is a
 * silent exit 0.
 */
export function answer<T>(json: boolean, value: T, toLines: (value: T) => string[]): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  const lines = toLines(value);
  if (lines.length > 0) console.log(lines.join("\n"));
}

/**
 * The one line a verb fails with, `✗ …` on stderr, as the exit code to return: 1, or 2
 * for wrong arguments. The secret is struck from it first (`redacted`).
 */
export function fail(line: string, code: 1 | 2 = 1): number {
  console.error(`✗ ${redacted(line)}`);
  return code;
}

/** A check's line, `✓ …` or `✗ …`. Doctor and init print these on stdout: they are the answer. */
export const checkLine = (ok: boolean, line: string): string => `${ok ? "✓" : "✗"} ${line}`;

/**
 * The data a ConvexError from the deployment carries, or undefined for any other error.
 * The deployment throws every one of its errors as a member of `CairnError`, so what
 * comes back narrows on `kind`; a ConvexError carrying anything else is not the
 * deployment's, and reads as undefined so its `message` still prints.
 */
export const errorData = (e: unknown): CairnError | undefined => {
  if (!(e instanceof ConvexError)) return undefined;
  const data: unknown = e.data;
  return typeof data === "object" && data !== null && "kind" in data
    ? (data as CairnError)
    : undefined;
};

/** True when the module at `importMetaUrl` is the script node was started with. */
export const isMain = (importMetaUrl: string): boolean =>
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === importMetaUrl;

/** The leading `//` comment block of a file, past a shebang, as the usage text. */
export function usageFromHeader(importMetaUrl: string): string {
  const lines = readFileSync(fileURLToPath(importMetaUrl), "utf8").split("\n");
  const doc: string[] = [];
  for (const l of lines[0]?.startsWith("#!") ? lines.slice(1) : lines) {
    if (!l.startsWith("//")) break;
    doc.push(l.replace(/^\/\/ ?/, ""));
  }
  return doc.join("\n");
}

/** What a CLI body may answer: a number is the exit code, anything else is exit 0. */
export type CliBody = (argv: string[]) => unknown;

/**
 * Runs `fn(argv)` as the CLI body. A UsageError is exit 2, any other error exit 1, a
 * number returned is the exit code, anything else exit 0. Via `process.exitCode`, so
 * pending writes finish.
 */
export async function main(
  fn: CliBody,
  { argv = process.argv.slice(2) }: { argv?: string[] } = {},
): Promise<void> {
  try {
    const code = await fn(argv);
    if (typeof code === "number") process.exitCode = code;
  } catch (e) {
    if (e instanceof UsageError) {
      process.exitCode = fail(`usage: ${e.message}`, 2);
      return;
    }
    if (e instanceof ConvexError) {
      // Every ConvexError the deployment throws carries { kind, message }; the message is
      // written for the person reading it, so it prints as-is, and the kind is what this
      // arm and a verb branch on.
      const data = errorData(e);
      process.exitCode = fail(data?.message ?? e.message);
      // A stale write is the one error worth more than its message: the events since the
      // revision the caller read are what it needs to decide, and the id and the revision
      // it is at now are the retry (design §9).
      if (data?.kind === "stale") {
        for (const line of staleLines(data)) console.error(line);
        // Every id ends `-<digits>` and a project's slug never holds a `-`, so what does
        // not is a slug, which `cn show` does not read.
        const reread = /-\d+$/.test(data.id) ? `cn show ${data.id}` : "cn project list --json";
        console.error(`  re-read with ${reread} and retry with --revision ${data.current}`);
      }
      return;
    }
    process.exitCode = fail(String((e as Error)?.message ?? e));
  }
}

/**
 * The deployment's secret, struck from a message before it is printed. Convex echoes the
 * whole argument object in an ArgumentValidationError, and `secret` is an argument on
 * every call, so a CLI ahead of its deployment would otherwise print the secret on every
 * refusal, into a terminal, a transcript or a CI log.
 */
export const redacted = (message: string): string =>
  message.replace(/(secret:\s*)"[^"]*"/g, '$1"…"');
