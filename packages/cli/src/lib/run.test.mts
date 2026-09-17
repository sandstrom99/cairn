import { describe, expect, it } from "vitest";
import { runCommand } from "./run.mts";

describe("runCommand", () => {
  it("captures what the command said and the status it exited with", () => {
    expect(runCommand("echo hello")).toEqual({
      command: "echo hello",
      exitCode: 0,
      output: "hello",
    });
  });

  it("reports a non-zero exit, which is what the deployment refuses a close on", () => {
    expect(runCommand("exit 3")).toMatchObject({ exitCode: 3, output: "" });
  });

  it("keeps the tail, because the end of a build is where the failure is", () => {
    const lines = runCommand("seq 1 60").output.split("\n");
    expect(lines).toHaveLength(40);
    expect(lines[0]).toBe("21");
    expect(lines.at(-1)).toBe("60");
  });

  it("takes fewer lines when asked", () => {
    expect(runCommand("seq 1 60", { tailLines: 2 }).output).toBe("59\n60");
  });

  it("captures stderr too, where a failing build as often writes", () => {
    expect(runCommand("echo out; echo boom >&2").output).toBe("out\nboom");
  });

  it("strips the colours a tool writes for a terminal", () => {
    const green = "[32m";
    const plain = "[39m";
    expect(runCommand(`printf '${green}pass${plain}: all green\n'`).output).toBe("pass: all green");
  });

  it("exits 124 and says so when the command outlives its timeout", () => {
    const { exitCode, output } = runCommand("sleep 5", { timeoutMs: 100 });
    expect(exitCode).toBe(124);
    expect(output).toContain("timed out");
  });
});
