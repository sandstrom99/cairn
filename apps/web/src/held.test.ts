// The page for one id holds the previous id's answer until its own lands: `hold` is the step
// `useStale` takes on every render, a pure function so the suite can drive it with no renderer.
import { describe, expect, it } from "vitest";
import { hold } from "./held.ts";

describe("hold", () => {
  it("takes a fresh answer under its key", () => {
    expect(hold({ key: "cn-1", value: "A" }, "cn-1", "A2")).toEqual({ key: "cn-1", value: "A2" });
  });

  it("keeps the previous id's answer, under its own key, until the new one lands", () => {
    const waiting = hold({ key: "cn-1", value: "A" }, "cn-2", undefined);
    expect(waiting).toEqual({ key: "cn-1", value: "A" });
    expect(hold(waiting, "cn-2", "B")).toEqual({ key: "cn-2", value: "B" });
  });

  it("lets go when there is no page to hold for, so the next id opens on its own answer", () => {
    const left = hold({ key: "cn-1", value: "A" }, undefined, undefined);
    expect(left).toEqual({ key: undefined, value: undefined });
    expect(hold(left, "cn-2", undefined)).toEqual({ key: undefined, value: undefined });
  });

  it("holds nothing where nothing has answered", () => {
    expect(hold({ key: "", value: undefined }, "", undefined)).toEqual({
      key: "",
      value: undefined,
    });
  });
});
