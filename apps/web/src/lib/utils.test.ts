// cn() knows the page's seven text sizes as sizes: one beside a colour keeps both, and two
// sizes resolve to the later one, the way Tailwind's own `text-sm` already did.
import { describe, expect, it } from "vitest";
import { TEXT_SIZES, cn } from "./utils.ts";

describe("cn", () => {
  it("keeps a page size beside a colour", () => {
    expect(cn("text-small text-slate")).toBe("text-small text-slate");
    expect(cn("text-slate text-small")).toBe("text-slate text-small");
  });

  it("keeps each of the seven sizes beside a colour", () => {
    for (const size of TEXT_SIZES)
      expect(cn(`text-${size} text-stuck-ink`)).toBe(`text-${size} text-stuck-ink`);
  });

  it("names the seven index.css sets", () => {
    expect(TEXT_SIZES).toEqual(["micro", "meta", "small", "row", "body", "title", "brief"]);
  });

  it("lets a later size beat an earlier one, Tailwind's own included", () => {
    expect(cn("text-small text-meta")).toBe("text-meta");
    expect(cn("text-sm text-small")).toBe("text-small");
    expect(cn("text-small text-sm")).toBe("text-sm");
  });
});
