// The column is one element in one place for every route that has one: the shell renders it
// after main whatever it lists, so going from the overview to an id's page changes what the
// aside holds and never which aside it is. The log has none.
import { now } from "@cairn/cli/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Listing } from "./Feed.tsx";
import { Shell } from "./Shell.tsx";

const render = (listing?: Listing): string =>
  renderToStaticMarkup(
    <Shell
      host="h"
      epics={[]}
      current="/"
      epicId={undefined}
      waiting={false}
      listing={listing}
      now={now}
      destinations={[]}
      onForget={() => {}}
    >
      <p>page</p>
    </Shell>,
  );

const asides = (markup: string): number => markup.split("<aside").length - 1;
const afterMain = (markup: string): string => markup.slice(markup.indexOf("</main>") + 7);

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
  });
});
