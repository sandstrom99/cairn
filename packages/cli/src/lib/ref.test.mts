import { describe, expect, it } from "vitest";
import { ref, refParts } from "./ref.mts";

describe("ref", () => {
  it("is the id, then the title in double quotes", () => {
    expect(ref({ id: "app-14", title: "fix connection retry" })).toBe(
      'app-14 "fix connection retry"',
    );
  });

  it("escapes a quote inside the title so the line stays one token pair", () => {
    expect(ref({ id: "web-2", title: 'the "share" sheet' })).toBe('web-2 "the \\"share\\" sheet"');
  });

  it("comes apart into the id and the title as it prints, and goes back together as itself", () => {
    const item = { id: "web-2", title: 'the "share" sheet' };
    const { id, title } = refParts(item);
    expect(title).toBe('the \\"share\\" sheet');
    expect(`${id} "${title}"`).toBe(ref(item));
  });
});
