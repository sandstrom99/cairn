// What "same title" means, at its boundaries: `issues.create` and `review.get` both read
// it (lib/titles.ts), so a threshold off by one here is a duplicate one verb hands back
// and the other does not, or a pair the sitting lists that the create never warned about.
import { describe, expect, it } from "vitest";
import { NEAR_TITLE_DISTANCE, distance, nearIdentical, normalise } from "../lib/titles";

describe("normalise", () => {
  it("lowercases", () => {
    expect(normalise("The Graph")).toBe("the graph");
  });

  it("makes a run of spaces and punctuation one space", () => {
    expect(normalise("Fix  connection-retry.")).toBe("fix connection retry");
  });

  it("trims", () => {
    expect(normalise("  -the graph-  ")).toBe("the graph");
  });

  it("keeps letters of any script whole", () => {
    expect(normalise("næste")).toBe("næste");
    expect(normalise("Næste skridt")).toBe("næste skridt");
  });
});

describe("distance", () => {
  it("is 0 for equal strings", () => {
    expect(distance("the graph", "the graph")).toBe(0);
  });

  it("counts one per substitution", () => {
    expect(distance("graph", "grapx")).toBe(1);
    expect(distance("graph", "grayx")).toBe(2);
    expect(distance("graph", "gruyx")).toBe(3);
  });

  it("counts an insertion as one", () => {
    expect(distance("graph", "graphs")).toBe(1);
    expect(distance("graph", "")).toBe(5);
  });
});

describe("nearIdentical", () => {
  it("is true at exactly NEAR_TITLE_DISTANCE after normalising, and false one past it", () => {
    expect(NEAR_TITLE_DISTANCE).toBe(2);
    expect(nearIdentical("the graph", "the grayx")).toBe(true);
    expect(nearIdentical("the graph", "the gruyx")).toBe(false);
  });

  it("is true for two titles that differ only in case and punctuation", () => {
    expect(nearIdentical("fix connection retry", "Fix connection-retry.")).toBe(true);
  });

  it("measures after normalising, so punctuation costs nothing", () => {
    expect(nearIdentical("the -- graph!!", "THE GRAYX")).toBe(true);
  });
});
