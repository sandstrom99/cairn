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
//
// `captureStdout` is the other shape, for `cn init --secret-cmd`: the same `sh -c` with
// the two streams kept apart, because there the stdout is a secret and only the stderr
// may be shown. Both go through the one `spawn` below, which is where a timeout becomes
// exit 124 and a signal 128 + N, so the two shapes cannot read the same end two ways.

import { spawnSync } from "node:child_process";
import { constants } from "node:os";

/** What a verification record carries, before the deployment stamps `at` and `by`. */
type RunResult = { command: string; exitCode: number; output: string };

type RunOptions = {
  /** How long the command may take before it is killed and the run exits 124. */
  timeoutMs?: number;
  /** How many lines of the tail to keep. */
  tailLines?: number;
};

const MINUTE = 60_000;
const TEN_MINUTES = 10 * MINUTE;
/**
 * Long for a command that prints one line, because a password manager's CLI may wait on
 * a person unlocking it, and its own unattended bound has to expire first.
 */
const UNLOCK = 150_000;
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

/** What `sh -c <command>` did: the two streams apart, and the exit code as a shell reports it. */
type Spawned = {
  /** 124 on a timeout, 128 + N for a signal, else the status, and 1 when there is none. */
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  /** Why the spawn itself failed, when it did: a shell that could not be started at all. */
  error?: string;
};

/** Runs `command` through `sh -c`, stdin closed, both streams captured, bounded by `timeoutMs`. */
function spawn(command: string, timeoutMs: number): Spawned {
  const result = spawnSync("sh", ["-c", command], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    timeout: timeoutMs,
  });
  const error = result.error as NodeJS.ErrnoException | undefined;
  const timedOut = error?.code === "ETIMEDOUT";
  const exitCode = timedOut
    ? 124
    : result.signal
      ? 128 + signalNumber(result.signal)
      : (result.status ?? 1);
  return {
    exitCode,
    timedOut,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(error ? { error: error.message } : {}),
  };
}

/**
 * A command's stdout alone, for a value that must not be merged, tailed or echoed: a
 * secret. The two streams stay apart so a caller can show why it failed without ever
 * showing what it printed. A timeout is exit 124 and a signal 128 + N, as `runCommand`
 * reports them; stdout comes back trimmed of its trailing line ending and nothing else.
 * That ending is `\r\n` when the command is a Windows binary reached from WSL, and a
 * carriage return left on a secret is a secret the deployment refuses.
 */
export function captureStdout(
  command: string,
  timeoutMs = UNLOCK,
): { exitCode: number; stdout: string; stderr: string } {
  const ran = spawn(command, timeoutMs);
  // A spawn that never ran has nothing on either stream, so its message is the diagnosis.
  const said = `${ran.stderr}${ran.error ? `\n${ran.error}` : ""}`;
  return {
    exitCode: ran.exitCode,
    stdout: ran.stdout.replace(/[\r\n]+$/, ""),
    stderr: said.trim(),
  };
}

/** Runs `command` and returns what it did, as the verification record takes it. */
export function runCommand(
  command: string,
  { timeoutMs = TEN_MINUTES, tailLines = TAIL }: RunOptions = {},
): RunResult {
  const ran = spawn(command, timeoutMs);
  const written = `${ran.stdout}${ran.stderr}`;
  // A spawn that never ran at all still has to say why, so its message is the output.
  const said = ran.error && !ran.timedOut ? `${written}\n${ran.error}` : written;
  const output = tail(said.replace(ANSI, ""), tailLines);
  return {
    command,
    exitCode: ran.exitCode,
    output: ran.timedOut
      ? `${output}\n[cn: timed out after ${Math.round(timeoutMs / MINUTE)} minutes]`
      : output,
  };
}
