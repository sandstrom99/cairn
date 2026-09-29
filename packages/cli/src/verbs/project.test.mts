import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.mts";
import { parse } from "./project.mts";

describe("cn project", () => {
  it("parses new with its name", () => {
    expect(parse(["new", "cn", "--name", "cairn: backend, cli, plugin"])).toEqual({
      action: "new",
      args: { slug: "cn", name: "cairn: backend, cli, plugin" },
    });
  });

  it("parses new with a description and links", () => {
    expect(
      parse([
        "new",
        "cn",
        "--name",
        "cairn",
        "--description",
        "not the marketing site",
        "--link",
        "[repo](https://example.com/repo)",
        "--link",
        "https://example.com/b",
      ]),
    ).toEqual({
      action: "new",
      args: {
        slug: "cn",
        name: "cairn",
        description: "not the marketing site",
        link: [
          { url: "https://example.com/repo", label: "repo" },
          { url: "https://example.com/b" },
        ],
      },
    });
  });

  it("refuses --unlink and --revision on new, which only update takes", () => {
    expect(() => parse(["new", "cn", "--name", "x", "--unlink", "https://a"])).toThrow(UsageError);
    expect(() => parse(["new", "cn", "--name", "x", "--revision", "0"])).toThrow(UsageError);
  });

  it("parses update with every flag", () => {
    expect(
      parse([
        "update",
        "cn",
        "--revision",
        "3",
        "--name",
        "cairn: the worklist",
        "--description",
        "why",
        "--link",
        "https://example.com/b",
        "--unlink",
        "https://example.com/repo",
      ]),
    ).toEqual({
      action: "update",
      args: {
        slug: "cn",
        revision: 3,
        name: "cairn: the worklist",
        description: "why",
        link: [{ url: "https://example.com/b" }],
        unlink: ["https://example.com/repo"],
      },
    });
  });

  it("sends only the fields update was given", () => {
    expect(parse(["update", "cn", "--revision", "0", "--name", "x"])).toEqual({
      action: "update",
      args: { slug: "cn", revision: 0, name: "x" },
    });
  });

  it("refuses update without --revision", () => {
    expect(() => parse(["update", "cn", "--name", "x"])).toThrow(/--revision N/);
  });

  it("refuses update with nothing to change", () => {
    expect(() => parse(["update", "cn", "--revision", "0"])).toThrow(
      /needs --name, --description, --link or --unlink/,
    );
  });

  it("refuses update with no slug, or two", () => {
    expect(() => parse(["update", "--revision", "0", "--name", "x"])).toThrow(UsageError);
    expect(() => parse(["update", "cn", "app", "--revision", "0", "--name", "x"])).toThrow(
      UsageError,
    );
  });

  it("has no --slug, since nothing changes a slug", () => {
    expect(() => parse(["update", "cn", "--revision", "0", "--slug", "app"])).toThrow(
      "unknown option --slug",
    );
  });

  it("parses list, with and without --json", () => {
    expect(parse(["list"])).toEqual({ action: "list", json: false });
    expect(parse(["list", "--json"])).toEqual({ action: "list", json: true });
  });

  it("refuses new with no slug or no name", () => {
    expect(() => parse(["new", "--name", "x"])).toThrow(UsageError);
    expect(() => parse(["new", "cn"])).toThrow(UsageError);
  });

  it("refuses an action it does not have", () => {
    expect(() => parse(["rename", "cn"])).toThrow(UsageError);
    expect(() => parse([])).toThrow(UsageError);
  });

  it("refuses a positional after list", () => {
    expect(() => parse(["list", "cn"])).toThrow(UsageError);
  });
});
