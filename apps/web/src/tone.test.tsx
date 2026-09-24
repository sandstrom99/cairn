// The tone vocabulary: which tone each of cn's state words carries, the word an epic's
// health comes to, and the classes a state word is set in. Rendered to a string rather
// than to a DOM, like everything in this suite.
import { agent, epic, now } from "@cairn/cli/testing";
import type { EpicLineView } from "@cairn/cli/views";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { plain } from "./plain.ts";
import { StateWord, epicWord, toneOf } from "./tone.tsx";

describe("toneOf", () => {
  it("gives cn's three chroma words their own tone", () => {
    for (const word of ["moving", "stuck", "waiting"] as const) expect(toneOf(word)).toBe(word);
  });

  it("sets every other word stateParts can produce as still", () => {
    for (const word of ["blocked", "deferred", "open", "closed", "dropped"])
      expect(toneOf(word)).toBe("still");
  });
});

describe("epicWord", () => {
  const moving = [{ id: "cn-26", title: "apps/web", claimedBy: agent, claimedAt: now }];
  const stuck = { id: "cn-10", title: "Invyte runs on cairn", lastActivity: now };

  it("puts a person needed first", () => {
    const waiting = [{ id: "bl-4", title: "name the day", owner: "balder" }];
    expect(epicWord(epic({ health: { moving: [], stuck: undefined, waiting } }))).toBe("waiting");
    expect(epicWord(epic({ health: { moving, stuck, waiting } }))).toBe("waiting");
  });

  it("puts silence before motion", () => {
    expect(epicWord(epic({ health: { moving: [], stuck, waiting: [] } }))).toBe("stuck");
    expect(epicWord(epic({ health: { moving, stuck, waiting: [] } }))).toBe("stuck");
  });

  it("says moving when something is and nothing more pressing is true", () => {
    expect(epicWord(epic({ health: { moving, stuck: undefined, waiting: [] } }))).toBe("moving");
  });

  it("reads a line view, which carries no status, as an open epic", () => {
    const line: EpicLineView = {
      id: "ep-0",
      title: "Inbox",
      counts: { open: 0, inProgress: 0, closed: 0, followUps: 0 },
      health: { moving: [], waiting: [] },
    };
    expect(epicWord(line)).toBe("nothing moving");
    expect(epicWord(epic())).toBe("nothing moving");
  });

  it("gives a finished epic with nothing to say its status", () => {
    expect(epicWord(epic({ status: "closed" }))).toBe("closed");
  });
});

describe("StateWord", () => {
  it("sets a chroma word in its tone, the dot before it", () => {
    const markup = renderToStaticMarkup(<StateWord word="moving" />);
    expect(markup).toContain("bg-moving");
    expect(markup).toContain("text-moving-ink");
    expect(plain(markup)).toBe("moving");
  });

  it("sets any other word still, with the hollow dot", () => {
    const markup = renderToStaticMarkup(<StateWord word="open" />);
    expect(markup).toContain("shadow-hollow");
    expect(markup).toContain("text-slate");
    expect(plain(markup)).toBe("open");
  });

  it("takes a tone the word is not, and keeps the word", () => {
    const markup = renderToStaticMarkup(<StateWord word="decision" tone="waiting" />);
    expect(markup).toContain("bg-waiting");
    expect(plain(markup)).toBe("decision");
  });

  it("keeps both the tone's colour and a text size passed in", () => {
    const markup = renderToStaticMarkup(<StateWord word="stuck" className="text-small" />);
    expect(markup).toContain("text-stuck-ink");
    expect(markup).toContain("text-small");
  });
});
