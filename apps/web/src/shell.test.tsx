// The column is one element in one place for every route that has one: the shell renders it
// after main whatever it lists, so going from the overview to an id's page changes what the
// aside holds and never which aside it is. The log has none.
import { now } from "@cairn/cli/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Listing } from "./Feed.tsx";
import { Shell } from "./Shell.tsx";

const render = (listing?: Listing, collapsed = false): string =>
  renderToStaticMarkup(
    <Shell
      host="h"
      epics={[]}
      current="/"
      epicId={undefined}
      waiting={false}
      listing={listing}
      collapsed={collapsed}
      onToggleColumn={() => {}}
      now={now}
      destinations={[]}
      onForget={() => {}}
    >
      <p>page</p>
    </Shell>,
  );

const asides = (markup: string): number => markup.split("<aside").length - 1;
const afterMain = (markup: string): string => markup.slice(markup.indexOf("</main>") + 7);
/** The opening tag that starts at `start`, up to its first `>`. */
const tagAt = (markup: string, start: string): string => {
  const from = markup.indexOf(start);
  return from < 0 ? "" : markup.slice(from, markup.indexOf(">", from) + 1);
};
const mainTag = (markup: string): string => tagAt(markup, "<main");
const columnTag = (markup: string): string => tagAt(markup, '<aside aria-label="Activity"');

describe("Shell", () => {
  it("puts the feed's column after main, beside the rail", () => {
    const markup = render({ kind: "feed", events: [] });
    expect(asides(markup)).toBe(2);
    expect(afterMain(markup)).toMatch(/^<aside aria-label="Activity"/);
  });

  it("puts an id's history in the same place", () => {
    const markup = render({ kind: "history", self: "cn-1", events: [] });
    expect(asides(markup)).toBe(2);
    expect(afterMain(markup)).toMatch(/^<aside aria-label="History"/);
  });

  it("has no column where the route lists nothing", () => {
    const markup = render();
    expect(asides(markup)).toBe(1);
    expect(afterMain(markup)).not.toMatch(/^<aside/);
    expect(mainTag(markup)).not.toContain("mr-(");
    expect(markup).not.toContain("right-(--main-right");
    expect(markup).toContain("right-0");
  });

  it("keeps main and the bar clear of the open column", () => {
    const markup = render({ kind: "feed", events: [] });
    // With the closing paren, since the strip's `mr-(--main-right-strip)` starts the same way.
    expect(mainTag(markup)).toContain("mr-(--main-right)");
    expect(mainTag(markup)).not.toContain("mr-(--main-right-strip)");
    expect(columnTag(markup)).toContain("w-(--side-width)");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-label="Collapse the column"');
    expect(markup).not.toContain('inert=""');
    expect(markup).toContain("right-(--main-right)");
    expect(markup).not.toContain("right-(--main-right-strip)");
  });

  it("collapses to the strip, main and the bar taking the room, the contents kept but inert", () => {
    const markup = render({ kind: "feed", events: [] }, true);
    expect(mainTag(markup)).toContain("mr-(--main-right-strip)");
    expect(columnTag(markup)).toContain("w-(--side-strip)");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Expand the column"');
    expect(markup).toContain('inert=""');
    expect(markup).toContain("right-(--main-right-strip)");
    expect(markup).toContain(">Activity</h2>");
    expect(markup).toContain("Nothing has happened here yet");
  });
});
