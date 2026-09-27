import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { tempHome } from "../lib/testing.mts";
import { parse } from "./create.mts";

describe("cn create", () => {
  it("parses the whole contract into the arguments the mutation takes", () => {
    expect(
      parse([
        "--project",
        "cn",
        "--epic",
        "ep-1",
        "--title",
        "schema, ids, revision, events",
        "--priority",
        "0",
        "--design",
        "transcribe §3",
        "--acceptance",
        "the schema pushes",
        "--type",
        "follow-up",
        "--kind",
        "verify",
        "--parent",
        "cn-1",
        "--requires",
        "ios",
        "device",
      ]),
    ).toEqual({
      action: "create",
      args: {
        project: "cn",
        epic: "ep-1",
        title: "schema, ids, revision, events",
        priority: 0,
        design: "transcribe §3",
        acceptance: "the schema pushes",
        type: "follow-up",
        followUpKind: "verify",
        parent: "cn-1",
        requires: ["ios", "device"],
      },
    });
  });

  it("leaves out what was not given rather than sending undefined", () => {
    expect(parse(["--project", "cn", "--title", "one"])).toEqual({
      action: "create",
      args: { project: "cn", title: "one" },
    });
  });

  it("sends no epic, because the deployment is what refuses and lists them", () => {
    const parsed = parse(["--project", "cn", "--title", "no epic"]);
    expect(parsed).toEqual({ action: "create", args: { project: "cn", title: "no epic" } });
  });

  it("reads each --link as a bare URL or a [label](url), and refuses an empty one", () => {
    const base = ["--project", "cn", "--title", "one"];
    expect(
      parse([
        ...base,
        "--link",
        "https://example.com/pr/7",
        "--link",
        "[doc](https://example.com/d)",
      ]),
    ).toEqual({
      action: "create",
      args: {
        project: "cn",
        title: "one",
        link: [{ url: "https://example.com/pr/7" }, { url: "https://example.com/d", label: "doc" }],
      },
    });
    expect(() => parse([...base, "--link", " "])).toThrow(/--link needs a URL/);
  });

  it("needs a project and a title", () => {
    expect(() => parse(["--title", "one"])).toThrow(UsageError);
    expect(() => parse(["--project", "cn"])).toThrow(UsageError);
  });

  it("refuses a positional: the title is a flag, not the rest of the line", () => {
    expect(() => parse(["--project", "cn", "--epic", "ep-1", "the title"])).toThrow(UsageError);
  });

  it("refuses a type, kind or priority the deployment would reject anyway", () => {
    const base = ["--project", "cn", "--title", "one"];
    expect(() => parse([...base, "--type", "chore"])).toThrow(UsageError);
    expect(() => parse([...base, "--kind", "ship"])).toThrow(UsageError);
    expect(() => parse([...base, "--priority", "soon"])).toThrow(UsageError);
    expect(() => parse([...base, "--priority="])).toThrow(/--priority is a whole number/);
    expect(() => parse([...base, "--priority", "5"])).toThrow(UsageError);
  });

  /** A real file holding a two-line Markdown body, gone after the test. */
  const notes = (): string => {
    const path = join(tempHome("cairn-text-"), "notes.md");
    writeFileSync(path, "# design\n\n- one\n");
    return path;
  };

  it("reads a text field from the file an @ value names, and refuses a missing one", () => {
    const base = ["--project", "cn", "--title", "one"];
    expect(parse([...base, "--design", `@${notes()}`])).toEqual({
      action: "create",
      args: { project: "cn", title: "one", design: "# design\n\n- one\n" },
    });
    expect(() => parse([...base, "--acceptance", "@missing.md"])).toThrow(UsageError);
    expect(() => parse([...base, "--acceptance", "@missing.md"])).toThrow(
      /^--acceptance @missing\.md: cannot read missing\.md \(ENOENT\)$/,
    );
  });
});
