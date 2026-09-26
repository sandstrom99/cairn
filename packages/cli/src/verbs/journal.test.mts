import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { tempHome } from "../lib/testing.mts";
import { parse } from "./journal.mts";

describe("cn journal", () => {
  it("takes the rest of the line as the body, so an entry needs no quoting", () => {
    expect(
      parse(["cn-2", "--kind", "finding", "claim", "works,", "closing", "with", "evidence"]),
    ).toEqual({
      action: "journal",
      args: { id: "cn-2", kind: "finding", body: "claim works, closing with evidence" },
    });
  });

  it("takes a quoted body too", () => {
    expect(parse(["cn-2", "--kind", "handoff", "where this stands"])).toEqual({
      action: "journal",
      args: { id: "cn-2", kind: "handoff", body: "where this stands" },
    });
  });

  it("needs an id, a kind that exists, and a body", () => {
    expect(() => parse(["--kind", "finding", "body"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "body"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--kind", "note", "body"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--kind", "finding"])).toThrow(UsageError);
  });

  /** A real file holding a two-line Markdown body, gone after the test. */
  const notes = (): string => {
    const path = join(tempHome("cairn-text-"), "notes.md");
    writeFileSync(path, "# design\n\n- one\n");
    return path;
  };

  it("reads the body from the file an @ value names, and refuses a missing one", () => {
    expect(parse(["cn-2", "--kind", "handoff", `@${notes()}`])).toEqual({
      action: "journal",
      args: { id: "cn-2", kind: "handoff", body: "# design\n\n- one" },
    });
    expect(() => parse(["cn-2", "--kind", "finding", "@missing.md"])).toThrow(UsageError);
  });

  it("reads @- as stdin only when it is the whole body, not when words follow it", () => {
    expect(() => parse(["cn-2", "--kind", "finding", "@-", "more"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--kind", "finding", "@-", "more"])).toThrow(
      /^the body @- more: cannot read - more/,
    );
  });
});
