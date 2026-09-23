// cli.mts: the shell every verb runs in, written once. Adapted from Invyte's
// tools/lib/cli.mts, trimmed to what cn needs.
//
//   import { UsageError, errorData, main, say, warn, usageFromHeader } from "../lib/cli.mts";
//
// `main(fn)` runs the CLI body with `process.argv.slice(2)` and owns the exit arms: a
// UsageError prints `✗ usage: …` and exits 2, a ConvexError prints the message the
// deployment wrote and exits 1 — and a stale one also prints every change since the
// revision the caller read, and the `cn show` and `--revision` to retry with — any other
// error prints `✗ …` and exits 1, and a number returned by `fn` is the exit code. It sets
// `process.exitCode` and never calls `process.exit()`: a pipe takes a large write
// asynchronously, and an exit right after it cuts the output at 64 KB.
//
// `errorData(e)` is what a ConvexError from the deployment carries, typed as the
// deployment's own `CairnError` union, for the verb that answers one kind itself.
//
// `say` and `warn` write one line to stderr with the `·` and `!` prefixes; stdout stays
// for the answer, so `cn … --json | jq` is always clean. `usageFromHeader(import.meta.url)`
// is the leading `//` comment block of the calling file, the way every verb documents
// itself: the file header is the --help text.

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
      console.error(`✗ usage: ${e.message}`);
      process.exitCode = 2;
      return;
    }
    if (e instanceof ConvexError) {
      // Every ConvexError the deployment throws carries { kind, message }; the message is
      // written for the person reading it, so it prints as-is, and the kind is what this
      // arm and a verb branch on.
      const data = errorData(e);
      console.error(`✗ ${redacted(data?.message ?? e.message)}`);
      // A stale write is the one error worth more than its message: the events since the
      // revision the caller read are what it needs to decide, and the id and the revision
      // it is at now are the retry (design §9).
      if (data?.kind === "stale") {
        for (const line of staleLines(data)) console.error(line);
        console.error(
          `  re-read with cn show ${data.id} and retry with --revision ${data.current}`,
        );
      }
      process.exitCode = 1;
      return;
    }
    console.error(`✗ ${redacted(String((e as Error)?.message ?? e))}`);
    process.exitCode = 1;
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
