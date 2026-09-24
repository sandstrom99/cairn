// The gate reads the kind every deployment error carries: a refused secret gets the form, a
// missing id gets Lost, and anything else its message. Fallback is rendered directly,
// because error boundaries do not run under server rendering.
import { ConvexError } from "convex/values";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Fallback, errorData } from "./Gate.tsx";
import { plain } from "./plain.ts";

const render = (error: Error, what?: string): string =>
  renderToStaticMarkup(<Fallback error={error} host="h" what={what} onSecret={() => {}} />);

describe("errorData", () => {
  it("reads the deployment's own kind and message", () => {
    const data = { kind: "unauthorized", message: "wrong secret" };
    expect(errorData(new ConvexError(data))).toEqual(data);
  });

  it("gives nothing for an error the deployment did not shape", () => {
    expect(errorData(new Error("x"))).toBeUndefined();
    expect(errorData(new ConvexError("a string"))).toBeUndefined();
  });
});

describe("Fallback", () => {
  it("asks for the secret when the guard refused it", () => {
    const markup = render(new ConvexError({ kind: "unauthorized", message: "wrong secret" }));
    const text = plain(markup);
    expect(text).toContain("This deployment did not answer");
    expect(text).toContain("h");
    expect(text).toContain("wrong secret");
    expect(markup).toContain('name="secret"');
  });

  it("says nothing is called that when the id was not found", () => {
    const error = new ConvexError({ kind: "not-found", message: "no such id cn-99" });
    expect(plain(render(error, "cn-99"))).toContain("Nothing here is called cn-99");
    expect(plain(render(error))).toContain("no such id cn-99");
  });

  it("prints anything else plainly, with no form", () => {
    const markup = render(new Error("boom"));
    expect(plain(markup)).toContain("Something broke");
    expect(plain(markup)).toContain("boom");
    expect(markup).not.toContain('name="secret"');
  });
});
