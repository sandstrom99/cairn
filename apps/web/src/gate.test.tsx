// The gate reads the kind every deployment error carries: a wanted secret gets the form, asked
// for or said to be refused, a missing id gets Lost, and anything else its message. Fallback
// is rendered directly, because error boundaries do not run under server rendering.
import { ConvexError } from "convex/values";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Unanswered } from "./Connect.tsx";
import { Fallback, errorData } from "./Gate.tsx";
import { plain } from "./plain.ts";

const render = (error: Error, what?: string, sent = false): string =>
  renderToStaticMarkup(
    <Fallback error={error} host="h" sent={sent} what={what} onSecret={() => {}} />,
  );

// The guard's own line, word for word (backend/convex/lib/guard.ts): cn's, never the page's.
const guard = new ConvexError({
  kind: "unauthorized",
  message:
    "this deployment needs a secret it did not get: put it under the deployment's `secret` in ~/.config/cairn/config.json, or set CAIRN_SECRET",
});

/** What a person in a browser must never be told to touch. */
const cnsOwn = ["config.json", "CAIRN_SECRET", "cn doctor", "did not get"];

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
  it("asks for the secret in its own words when this browser sent none", () => {
    const markup = render(guard);
    const text = plain(markup);
    expect(text).toContain("This deployment needs its secret");
    expect(text).toContain("h");
    expect(text).not.toContain("did not answer");
    expect(text).not.toContain("refused");
    for (const word of cnsOwn) expect(text).not.toContain(word);
    expect(markup).toContain('name="secret"');
  });

  it("says a secret it sent was refused, and keeps the field", () => {
    const markup = render(guard, undefined, true);
    const text = plain(markup);
    expect(text).toContain("This deployment refused the secret");
    expect(text).not.toContain("did not answer");
    for (const word of cnsOwn) expect(text).not.toContain(word);
    expect(markup).toContain('name="secret"');
  });

  it("says nothing is called that when the id was not found", () => {
    const error = new ConvexError({ kind: "not-found", message: "no such id cn-99" });
    expect(plain(render(error, "cn-99"))).toContain("Nothing here is called cn-99");
    expect(plain(render(error))).toContain("no such id cn-99");
  });

  it("says a deployment that never answered did not, with no form and no command", () => {
    const markup = renderToStaticMarkup(<Unanswered host="h" seconds={5} />);
    const text = plain(markup);
    expect(text).toContain("This deployment did not answer");
    expect(text).toContain("No answer in 5 seconds");
    for (const word of cnsOwn) expect(text).not.toContain(word);
    expect(markup).not.toContain('name="secret"');
  });

  it("prints anything else plainly, with no form", () => {
    const markup = render(new Error("boom"));
    expect(plain(markup)).toContain("Something broke");
    expect(plain(markup)).toContain("boom");
    expect(markup).not.toContain('name="secret"');
  });
});
