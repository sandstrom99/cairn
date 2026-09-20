// Rendered to a string rather than to a DOM: this proves the reference form reaches the
// markup, and with it that JSX compiles under `vp test` and that ref.mts resolves from
// @cairn/cli. A DOM would add a dependency and prove nothing more.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EpicList } from "./EpicList.tsx";

describe("EpicList", () => {
  it("prints one epic per line in the reference form, in the order given", () => {
    const markup = renderToStaticMarkup(
      <EpicList
        epics={[
          { id: "ep-1", title: "Create to close" },
          { id: "ep-2", title: "Epic health" },
        ]}
      />,
    );
    expect(markup).toContain("ep-1 &quot;Create to close&quot;");
    expect(markup).toContain("ep-2 &quot;Epic health&quot;");
    expect(markup.indexOf("ep-1")).toBeLessThan(markup.indexOf("ep-2"));
  });

  it("says so when there are none", () => {
    expect(renderToStaticMarkup(<EpicList epics={[]} />)).toContain("no open epics");
  });
});
