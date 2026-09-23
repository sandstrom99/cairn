import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
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

  it("needs a project and a title", () => {
    expect(() => parse(["--title", "one"])).toThrow(UsageError);
    expect(() => parse(["--project", "cn"])).toThrow(UsageError);
  });

  it("refuses a type, kind or priority the deployment would reject anyway", () => {
    const base = ["--project", "cn", "--title", "one"];
    expect(() => parse([...base, "--type", "chore"])).toThrow(UsageError);
    expect(() => parse([...base, "--kind", "ship"])).toThrow(UsageError);
    expect(() => parse([...base, "--priority", "soon"])).toThrow(UsageError);
    expect(() => parse([...base, "--priority="])).toThrow(/--priority is a whole number/);
    expect(() => parse([...base, "--priority", "5"])).toThrow(UsageError);
  });
});
