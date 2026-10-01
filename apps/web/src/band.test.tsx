// The band of projects on the Overview: its tiles in orderProjects' order with the page's own
// words, nothing where there is nothing to draw, and every bar against the most events any
// project had in a day. Rendered to a string rather than to a DOM, like everything in this suite.
import { project } from "@cairn/cli/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Band } from "./Band.tsx";
import { text } from "./testing.tsx";

const app = project({
  slug: "app",
  name: "the app",
  filed: 6,
  counts: { open: 4, inProgress: 1, closed: 1, dropped: 0, followUps: 0 },
  health: {
    moving: [],
    stuck: [],
    waiting: [{ id: "bl-1", title: "settings", owner: "balder" }],
  },
  pulse: [
    ...Array.from({ length: 26 }, () => ({ events: 0, closes: 0 })),
    { events: 3, closes: 1 },
    { events: 2, closes: 0 },
  ],
});

const admin = project({ slug: "admin", name: "the admin app" });

describe("the band of projects", () => {
  it("draws a tile per project, most pressing first, each a link to its page", () => {
    expect(text(<Band projects={[admin, app]} />)).toBe(
      "Across the projects 28 days · closes in ink · most pressing first " +
        "app waiting 5 live 1 closed " +
        "admin nothing filed",
    );
    const markup = renderToStaticMarkup(<Band projects={[admin, app]} />);
    expect(markup).toContain('href="/projects/app"');
    expect(markup).toContain('href="/projects/admin"');
  });

  it("draws nothing before the list answers, and nothing for no projects", () => {
    expect(renderToStaticMarkup(<Band projects={[]} />)).toBe("");
    expect(renderToStaticMarkup(<Band projects={undefined} />)).toBe("");
  });

  it("draws the busiest day the full height of the tile's pulse", () => {
    // The 3-event day is its close in ink, 10px, under its two other events, 20px: 30 in all.
    const day = renderToStaticMarkup(<Band projects={[app]} />).match(
      /<i [^>]*title="1d ago: 3 events, 1 closed">(.*?)<\/i>/,
    )?.[1];
    expect(day).toContain('style="height:10px"');
    expect(day).toContain('style="height:20px"');
  });
});
