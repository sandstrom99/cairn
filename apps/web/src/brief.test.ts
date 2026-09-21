import type { BriefView } from "@cairn/cli/src/lib/format.mts";
import { describe, expect, it } from "vitest";
import { headline, underline } from "./brief.ts";

const view = (over: Partial<BriefView> = {}): BriefView => ({
  ready: { count: 0, top: [] },
  inProgress: [],
  followUps: { count: 0, covered: [] },
  waiting: 0,
  flagged: 0,
  ...over,
});

describe("headline", () => {
  it("says the three counts in a fixed order, waiting first", () => {
    const clauses = headline(
      view({
        waiting: 1,
        inProgress: [{ id: "cn-26", title: "t", claimedBy: undefined, claimedAt: undefined }],
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

  it("counts follow-ups, and the ones that ask something of a session", () => {
    const covered = [{ id: "cn-20", title: "t", followUpKind: undefined, requires: [] }];
    expect(underline(view({ followUps: { count: 3, covered } }))).toBe(
      "3 follow-ups, 2 with requirements.",
    );
    expect(underline(view({ followUps: { count: 1, covered } }))).toBe("1 follow-up.");
  });

  it("says what reconcile raised", () => {
    expect(underline(view({ flagged: 2 }))).toBe("2 raised by reconcile.");
  });
});
