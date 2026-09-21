import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Prose, blocksOf } from "./Prose.tsx";

describe("blocksOf", () => {
  it("splits paragraphs on a blank line and gathers `- ` lines into a list", () => {
    expect(blocksOf("first line\nsame paragraph\n\n- one\n- two\nafter")).toEqual([
      { list: false, lines: ["first line", "same paragraph"] },
      { list: true, lines: ["one", "two"] },
      { list: false, lines: ["after"] },
    ]);
  });
});

describe("Prose", () => {
  it("sets backticks as code and leaves an unclosed one as written", () => {
    const markup = renderToStaticMarkup(<Prose text={"run `cn ready` first\n\na stray ` tick"} />);
    expect(markup).toContain(">cn ready</code>");
    expect(markup).toContain("a stray ` tick");
  });

  it("never reads text as markup", () => {
    expect(renderToStaticMarkup(<Prose text={"<script>x</script>"} />)).toContain("&lt;script&gt;");
  });
});
