import { describe, expect, it } from "vitest";
import { ref } from "./ref.mts";

describe("ref", () => {
  it("is the id, then the title in double quotes", () => {
    expect(ref({ id: "app-14", title: "fix connection retry" })).toBe(
      'app-14 "fix connection retry"',
    );
  });

  it("escapes a quote inside the title so the line stays one token pair", () => {
    expect(ref({ id: "web-2", title: 'the "share" sheet' })).toBe('web-2 "the \\"share\\" sheet"');
  });
});
