import { briefView as view } from "@cairn/cli/testing";
import { describe, expect, it } from "vitest";
import { headline, underline } from "./brief.ts";

describe("headline", () => {
  it("says the three counts in a fixed order, waiting first", () => {
    const clauses = headline(
      view({
        waiting: 1,
        inProgress: [
          { id: "cn-26", title: "t", claimedBy: undefined, claimedAt: undefined, mine: false },
        ],
        ready: { count: 2, top: [] },
      }),
    );
    expect(clauses.map((c) => c.text)).toEqual(["1 waiting on you.", "1 in progress.", "2 ready."]);
    expect(clauses.every((c) => !c.empty)).toBe(true);
  });

  it("keeps a clause with nothing behind it, marked so the page can set it back", () => {
    expect(headline(view())).toEqual([
      { text: "Nothing waiting on you.", empty: true },
      { text: "Nothing in progress.", empty: true },
      { text: "Nothing ready.", empty: true },
    ]);
  });
});

describe("underline", () => {
  it("is nothing when there is nothing to say", () => {
    expect(underline(view())).toBeUndefined();
  });

  it("counts the open follow-ups", () => {
    const one = { id: "cn-20", title: "t", followUpKind: "verify" as const };
    expect(
      underline(view({ followUps: [one, { ...one, id: "cn-21" }, { ...one, id: "cn-22" }] })),
    ).toBe("3 follow-ups.");
    expect(underline(view({ followUps: [one] }))).toBe("1 follow-up.");
  });
});
