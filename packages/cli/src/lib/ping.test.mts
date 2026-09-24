import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { CairnClient } from "./client.mts";
import { ping } from "./ping.mts";

const target = { url: "https://tidy-otter-1.convex.cloud", secret: "s3cret" };

/** A client whose one query answers `projects`, or throws `error`. */
const client = (projects: number, error?: unknown): CairnClient =>
  ({
    query: async () => {
      if (error !== undefined) throw error;
      return Array.from({ length: projects }, (_, i) => ({ slug: `p${i}`, name: `P${i}` }));
    },
    mutation: async () => null,
  }) as unknown as CairnClient;

describe("ping", () => {
  it("answers with how many projects the deployment has", async () => {
    expect(await ping(target, client(2))).toEqual({ answered: true, projects: 2 });
    expect(await ping(target, client(0))).toEqual({ answered: true, projects: 0 });
  });

  it("reads the deployment's unauthorized as a refusal of the secret", async () => {
    const refused = new ConvexError({ kind: "unauthorized", message: "wrong secret" });
    expect(await ping(target, client(0, refused))).toEqual({
      answered: false,
      refused: true,
      message: "wrong secret",
    });
  });

  it("reads anything else as not answering, with the message", async () => {
    expect(await ping(target, client(0, new Error("fetch failed")))).toEqual({
      answered: false,
      refused: false,
      message: "fetch failed",
    });
  });

  it("strikes the secret from the message before anybody prints it", async () => {
    const echoed = new Error(
      'ArgumentValidationError: Object contains extra field `secret` … {"secret": "s3cret", "x": "s3cret"}',
    );
    const { message } = (await ping(target, client(0, echoed))) as { message: string };
    expect(message).not.toContain("s3cret");
    expect(message).toContain("[secret]");
    // And with no secret to strike, the message is the message.
    const open = await ping({ url: target.url }, client(0, new Error("fetch failed")));
    expect(open).toMatchObject({ message: "fetch failed" });
  });
});
