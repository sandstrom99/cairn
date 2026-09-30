import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown.tsx";
import { Prose, typesetting, Written } from "./Prose.tsx";

const text = "**first** line\nsame paragraph\n\n- one\n- two";

await typesetting;

describe("Prose", () => {
  it("sets a passage as Markdown.tsx does, once the renderer is in", () => {
    expect(renderToStaticMarkup(<Prose text={text} className="text-small" />)).toBe(
      renderToStaticMarkup(<Markdown text={text} className="text-small" />),
    );
  });

  it("reads as written until then, every character and line break kept", () => {
    const markup = renderToStaticMarkup(<Written text={text} />);
    expect(markup).toMatch(/^<div class="[^"]*whitespace-pre-wrap[^"]*">/);
    expect(markup).toContain("**first** line\nsame paragraph\n\n- one\n- two</div>");
  });
});
