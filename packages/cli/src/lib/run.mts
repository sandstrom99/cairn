// run.mts: cn runs the command that proves the close, so nothing about the proof passes
// through the agent.
//
//   import { runCommand } from "../lib/run.mts";
//   const { command, exitCode, output } = runCommand("vp run verify");
//
// In beads, close takes a free-text reason nothing checks, which is exactly how work gets
// marked done without ever being confirmed (docs/design.md §5). Here the record is what
// the command did: its exit status and the tail of what it wrote, captured here and sent
// as-is. The deployment refuses a non-zero exit unless the close says `unverified`.
//
// The command runs through `sh -c`, so a pipeline or a `&&` works, with stdin closed —
// nothing it runs may wait for a person. stdout and stderr are both captured and joined:
// the interesting line of a failing build is as often on stderr as not.

import { spawnSync } from "node:child_process";
import { constants } from "node:os";

/** What a verification record carries, before the deployment stamps `at` and `by`. */
export type RunResult = { command: string; exitCode: number; output: string };

export type RunOptions = {
  /** How long the command may take before it is killed and the run exits 124. */
  timeoutMs?: number;
  /** How many lines of the tail to keep. */
  tailLines?: number;
};

const MINUTE = 60_000;
const TEN_MINUTES = 10 * MINUTE;
const TAIL = 40;
/** 64 MB of output, past which the pipe is cut. Only the tail is kept anyway. */
const MAX_BUFFER = 64 * 1024 * 1024;

// Built from strings rather than written as a regex literal, with the two control
// characters spelled as escapes so nothing invisible sits in the source.
const ESC = "\u001b";
const BEL = "\u0007";
const ANSI = new RegExp(
  `${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`,
  "g",
);

/** The last `lines` lines, with the trailing blank line a command leaves behind dropped. */
const tail = (text: string, lines: number): string =>
  text.replace(/\n+$/, "").split("\n").slice(-lines).join("\n");

/** A signal's number, for the 128 + N convention a shell reports. */
const signalNumber = (signal: NodeJS.Signals): number => constants.signals[signal] ?? 0;

/** Runs `command` and returns what it did, as the verification record takes it. */
export function runCommand(
  command: string,
  { timeoutMs = TEN_MINUTES, tailLines = TAIL }: RunOptions = {},
): RunResult {
  const result = spawnSync("sh", ["-c", command], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    timeout: timeoutMs,
  });

  const error = result.error as NodeJS.ErrnoException | undefined;
  const timedOut = error?.code === "ETIMEDOUT";
  const written = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  // A spawn that never ran at all still has to say why, so its message is the output.
  const said = error && !timedOut ? `${written}\n${error.message}` : written;

  const exitCode = timedOut
    ? 124
    : result.signal
      ? 128 + signalNumber(result.signal)
      : (result.status ?? 1);
  const output = tail(said.replace(ANSI, ""), tailLines);
  return {
    command,
    exitCode,
    output: timedOut
      ? `${output}\n[cn: timed out after ${Math.round(timeoutMs / MINUTE)} minutes]`
      : output,
  };
}
