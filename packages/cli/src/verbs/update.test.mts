import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { tempHome } from "../lib/testing.mts";
import { parse } from "./update.mts";

describe("cn update", () => {
  it("sends the id, the revision and only the fields that were given", () => {
    expect(parse(["cn-2", "--revision", "1", "--priority", "1"])).toEqual({
      action: "update",
      kind: "issue",
      args: { id: "cn-2", revision: 1, priority: 1 },
    });
  });

  it("parses the whole contract", () => {
    expect(
      parse([
        "cn-2",
        "--revision",
        "3",
        "--title",
        "the lifecycle",
        "--description",
        "claim to close",
        "--design",
        "one mutation per verb",
        "--acceptance",
        "two claims, one wins",
        "--priority",
        "0",
        "--epic",
        "ep-2",
        "--defer-until",
        "2026-10-01",
        "--requires",
        "ios",
        "device",
      ]),
    ).toEqual({
      action: "update",
      kind: "issue",
      args: {
        id: "cn-2",
        revision: 3,
        title: "the lifecycle",
        description: "claim to close",
        design: "one mutation per verb",
        acceptance: "two claims, one wins",
        priority: 0,
        epic: "ep-2",
        deferUntil: Date.parse("2026-10-01"),
        requires: ["ios", "device"],
      },
    });
  });

  it("clears a date and a capability list with none, which absent does not", () => {
    expect(parse(["cn-2", "--revision", "0", "--defer-until", "none"])).toEqual({
      action: "update",
      kind: "issue",
      args: { id: "cn-2", revision: 0, deferUntil: null },
    });
    expect(parse(["cn-2", "--revision", "0", "--requires", "none"])).toEqual({
      action: "update",
      kind: "issue",
      args: { id: "cn-2", revision: 0, requires: [] },
    });
  });

  it("adds links and takes them off, each flag on its own being a change", () => {
    expect(
      parse([
        "cn-2",
        "--revision",
        "1",
        "--link",
        "[the doc](https://example.com/d)",
        "--link",
        "https://example.com/b",
        "--unlink",
        "https://example.com/old",
      ]),
    ).toEqual({
      action: "update",
      kind: "issue",
      args: {
        id: "cn-2",
        revision: 1,
        link: [
          { url: "https://example.com/d", label: "the doc" },
          { url: "https://example.com/b" },
        ],
        unlink: ["https://example.com/old"],
      },
    });
    expect(parse(["cn-2", "--revision", "1", "--unlink", " https://example.com/b "])).toEqual({
      action: "update",
      kind: "issue",
      args: { id: "cn-2", revision: 1, unlink: ["https://example.com/b"] },
    });
    expect(() => parse(["cn-2", "--revision", "1", "--unlink", ""])).toThrow(
      /^--unlink needs a URL$/,
    );
  });

  it("reads an epic id as an epic's title, description and links", () => {
    expect(
      parse([
        "ep-3",
        "--revision",
        "2",
        "--title",
        "the plan",
        "--description",
        "why",
        "--link",
        "[plan](https://example.com/p)",
      ]),
    ).toEqual({
      action: "update",
      kind: "epic",
      args: {
        id: "ep-3",
        revision: 2,
        title: "the plan",
        description: "why",
        link: [{ url: "https://example.com/p", label: "plan" }],
      },
    });
  });

  it("reads a blocker id's --resolves as what resolves it", () => {
    expect(
      parse([
        "bl-2",
        "--revision",
        "1",
        "--resolves",
        "one is picked",
        "--unlink",
        "https://x.dev",
      ]),
    ).toEqual({
      action: "update",
      kind: "blocker",
      args: { id: "bl-2", revision: 1, whatResolves: "one is picked", unlink: ["https://x.dev"] },
    });
  });

  it("refuses a flag the thing has no field for, naming what it takes", () => {
    expect(() => parse(["ep-3", "--revision", "2", "--priority", "1"])).toThrow(
      /^an epic has no --priority; cn update ep-3 takes --title, --description, --link and --unlink$/,
    );
    expect(() => parse(["bl-2", "--revision", "2", "--description", "x"])).toThrow(
      /^a blocker has no --description; cn update bl-2 takes --title, --resolves, --link and --unlink$/,
    );
    expect(() => parse(["cn-1", "--revision", "2", "--resolves", "x"])).toThrow(
      /^an issue has no --resolves; cn update cn-1 takes --title, --description, --design, --acceptance, --priority, --epic, --defer-until, --requires, --link and --unlink$/,
    );
    expect(() => parse(["ep-3", "--revision", "2"])).toThrow(
      /^cn update <id> --revision N needs a field to change$/,
    );
    expect(() => parse(["bl-2", "--revision", "2", "--owner", "x"])).toThrow(
      /^unknown option --owner$/,
    );
  });

  it("needs an integer revision and at least one field to change", () => {
    expect(() => parse(["cn-2", "--priority", "1"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--revision", "later", "--priority", "1"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--revision", "1"])).toThrow(UsageError);
  });

  it("refuses a date it cannot read and a priority that is not a number", () => {
    expect(() => parse(["cn-2", "--revision", "1", "--defer-until", "soon"])).toThrow(UsageError);
    expect(() => parse(["cn-2", "--revision", "1", "--priority", "high"])).toThrow(UsageError);
  });

  it("refuses --revision= and --priority=, which are blanks, not zeros", () => {
    expect(() => parse(["cn-2", "--revision=", "--priority", "1"])).toThrow(
      /the revision cn last printed/,
    );
    expect(() => parse(["cn-2", "--revision", "1", "--priority="])).toThrow(
      /--priority is a whole number from 0 to 4/,
    );
  });

  /** A real file holding a two-line Markdown body, gone after the test. */
  const notes = (): string => {
    const path = join(tempHome("cairn-text-"), "notes.md");
    writeFileSync(path, "# design\n\n- one\n");
    return path;
  };

  it("reads a text field from the file an @ value names, and refuses a missing one", () => {
    expect(parse(["cn-2", "--revision", "1", "--description", `@${notes()}`])).toEqual({
      action: "update",
      kind: "issue",
      args: { id: "cn-2", revision: 1, description: "# design\n\n- one\n" },
    });
    expect(() => parse(["cn-2", "--revision", "1", "--design", "@missing.md"])).toThrow(UsageError);
  });
});
