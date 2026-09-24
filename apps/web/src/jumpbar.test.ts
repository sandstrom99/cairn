import { describe, expect, it } from "vitest";
import { withTyped } from "./JumpBar.tsx";

describe("withTyped", () => {
  it("offers a typed id no list holds, lowercased", () => {
    const row = [{ id: "ep-9", title: "Open it by id", what: "" }];
    expect(withTyped("ep-9", [])).toEqual(row);
    expect(withTyped(" EP-9 ", [])).toEqual(row);
  });

  it("leaves the list alone when it already holds the id", () => {
    const listed = [{ id: "ep-9", title: "x", what: "epic" }];
    expect(withTyped("ep-9", listed)).toEqual(listed);
  });

  it("adds nothing for a term that is not an id", () => {
    expect(withTyped("shadow", [])).toEqual([]);
    expect(withTyped("", [])).toEqual([]);
  });
});
