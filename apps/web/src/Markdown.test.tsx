import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { plain } from "./plain.ts";
import { Markdown } from "./Markdown.tsx";

const render = (text: string) => renderToStaticMarkup(<Markdown text={text} />);
/** The markup with its classes gone, so a test reads the elements and not their styling. */
const shape = (text: string) => render(text).replace(/ class="[^"]*"/g, "");

describe("Markdown", () => {
  it("reads the text written before it as it read then: paragraphs, `- ` lists, backticks", () => {
    expect(shape("first line\nsame paragraph\n\n- one\n- two\n\nrun `cn ready` first")).toBe(
      "<div><p>first line\nsame paragraph</p>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n" +
        "<p>run <code>cn ready</code> first</p></div>",
    );
  });

  it("lets a list interrupt a paragraph, the way agents write one", () => {
    expect(shape("Three shapes:\n1. one\n2. two")).toBe(
      "<div><p>Three shapes:</p>\n<ol>\n<li>one</li>\n<li>two</li>\n</ol></div>",
    );
  });

  it("sets headings under the page's own, and bold, links, quotes and rules", () => {
    const markup = shape(
      "# Why\n\n### What changed\n\n**bold** and *slanted* and ~~gone~~\n\n> quoted\n\n---",
    );
    expect(markup).toContain("<h3>Why</h3>");
    expect(markup).toContain("<h4>What changed</h4>");
    expect(markup).toContain("<strong>bold</strong> and <em>slanted</em> and <del>gone</del>");
    expect(markup).toContain("<blockquote>\n<p>quoted</p>\n</blockquote>");
    expect(markup).toContain("<hr/>");
  });

  it("sets a fenced block as a block, without the inline tint on its code", () => {
    const markup = render("```sh\nvp run verify\n```");
    expect(markup).toMatch(/<pre class="[^"]*bg-ink[^"]*"><code class="language-sh">/);
    expect(plain(markup)).toBe("vp run verify");
  });

  it("sets tables, task lists and bare links from GitHub's flavour", () => {
    const markup = shape(
      "| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] todo\n- [x] done\n\nsee https://example.com",
    );
    expect(markup).toContain("<th>a</th>");
    expect(markup).toContain("<td>2</td>");
    expect(markup).toMatch(/<span role="img" aria-label="not done"><\/span> todo/);
    expect(markup).toMatch(/<span role="img" aria-label="done"><svg[^]*?<\/svg><\/span> done/);
    expect(markup).toContain(
      '<a href="https://example.com" target="_blank" rel="noreferrer">https://example.com</a>',
    );
  });

  it("leaves a link into the page to the page, without a new tab", () => {
    expect(shape("[the issue](/cn-14)")).toContain('<a href="/cn-14">the issue</a>');
  });

  it("never reads text as markup, and a script link goes nowhere", () => {
    const markup = render("<script>x</script> and <b>bold</b>\n\n[click](javascript:alert(1))");
    expect(markup).toContain("&lt;script&gt;x&lt;/script&gt; and &lt;b&gt;bold&lt;/b&gt;");
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("javascript:");
  });
});
