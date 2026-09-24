// The ask menu, as far as a string can show it: the lines read as sentences with the id and
// never the title, and the closed menu is its trigger alone, or nothing when no line holds.
import { issue, now } from "@cairn/cli/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Ask, AskList } from "./Ask.tsx";
import { issuePrompts } from "./prompts.ts";
import { rows, text } from "./testing.tsx";

describe("the ask menu", () => {
  const shown = issue();
  const prompts = issuePrompts(shown, now);

  it("numbers its lines and names the item by its id", () => {
    expect(rows(<AskList prompts={prompts} active={0} />)).toEqual([
      "1 Catch me up on cn-1: where it stands, what's been tried, what's left.",
      "2 Pick up cn-1 and get it moving.",
    ]);
  });

  it("leaves the title to the clipboard", () => {
    expect(text(<AskList prompts={prompts} active={0} />)).not.toContain(shown.title);
  });

  it("is nothing where no line holds, and its trigger alone while closed", () => {
    expect(renderToStaticMarkup(<Ask prompts={[]} />)).toBe("");
    expect(renderToStaticMarkup(<Ask prompts={prompts} />)).toContain(
      'aria-label="Say to your agent"',
    );
  });
});
