// The two list pages on an empty deployment: cn prints nothing there, so each page names
// the command that fills it instead of an empty box.
import { now } from "@cairn/cli/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssuesPage, LogPage } from "./ListPages.tsx";
import { plain } from "./plain.ts";

describe("IssuesPage", () => {
  it("names the command that makes the first issue", () => {
    const text = plain(renderToStaticMarkup(<IssuesPage issues={[]} />));
    expect(text).toContain("None yet.");
    expect(text).toContain("cn create --project <slug> --epic <ep-id> --title");
  });
});

describe("LogPage", () => {
  it("names the first write instead of an empty list", () => {
    const markup = renderToStaticMarkup(<LogPage events={[]} now={now} />);
    expect(plain(markup)).toContain("Nothing yet.");
    expect(plain(markup)).toContain("cn epic new");
    expect(markup).not.toContain("<ul");
  });
});
