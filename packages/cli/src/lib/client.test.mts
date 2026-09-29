import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { type CairnClient, api, explained, withSecret } from "./client.mts";

/** A client that records what it was called with instead of opening anything. */
function fake() {
  const query = vi.fn(async () => []);
  const mutation = vi.fn(async () => null);
  return { query, mutation } as unknown as CairnClient & {
    query: ReturnType<typeof vi.fn>;
    mutation: ReturnType<typeof vi.fn>;
  };
}

describe("withSecret", () => {
  it("spreads the secret into every call", async () => {
    const http = fake();
    const client = withSecret(http, "s");
    await client.query(api.issues.list, { project: "a" });
    await client.mutation(api.projects.create, {
      actor: { name: "wsl/claude", kind: "agent" },
      slug: "a",
      name: "A",
    });
    expect(http.query.mock.calls[0][1]).toEqual({ project: "a", secret: "s" });
    expect(http.mutation.mock.calls[0][1]).toMatchObject({ slug: "a", secret: "s" });
  });

  it("passes the arguments through with no secret key when there is none", async () => {
    const http = fake();
    const client = withSecret(http, undefined);
    await client.query(api.issues.list, { project: "a" });
    expect(client).toBe(http);
    expect(http.query.mock.calls[0][1]).toEqual({ project: "a" });
  });
});

describe("explained", () => {
  const cairn = {
    name: "cairn",
    url: "https://tidy-otter-1.convex.cloud",
    source: "default" as const,
  };
  /** A client whose every call throws `error`. */
  const throwing = (error: unknown): CairnClient =>
    ({
      query: async () => {
        throw error;
      },
      mutation: async () => {
        throw error;
      },
    }) as unknown as CairnClient;
  // What ConvexHttpClient threw for an argument the deployment's validator does not take.
  const extra = new Error(
    '[Request ID: 0749d64b8b339704] Server Error\nArgumentValidationError: Object contains extra field `bogus` that is not in the validator.\n\nObject: {bogus: 1.0, id: "cn-1", secret: "s3cret"}\nValidator: v.object({id: v.string()})\n\n',
  );

  it("rethrows a mismatch as the one line naming the deployment, the call and the fix", async () => {
    const client = explained(throwing(extra), cairn, "/src/cairn");
    const thrown = await client.query(api.show.get, { id: "cn-1" }).catch((e: unknown) => e);
    expect((thrown as Error).message).toBe(
      "cairn runs older functions than this cn (show:get has no `bogus`): vp run @cairn/backend#push:cloud -- cairn",
    );
    expect((thrown as Error).cause).toBe(extra);
    await expect(
      client.mutation(api.projects.create, {
        actor: { name: "wsl/claude", kind: "agent" },
        slug: "a",
        name: "A",
      }),
    ).rejects.toThrow("(projects:create has no `bogus`)");
  });

  it("passes the deployment's own ConvexError through as the same error", async () => {
    const refused = new ConvexError({ kind: "unauthorized", message: "wrong secret" });
    const client = explained(throwing(refused), cairn, "/src/cairn");
    const thrown = await client.query(api.projects.list, {}).catch((e: unknown) => e);
    expect(thrown).toBe(refused);
  });

  it("passes any other error through untouched", async () => {
    const offline = new Error("fetch failed");
    const client = explained(throwing(offline), cairn, "/src/cairn");
    const thrown = await client.query(api.projects.list, {}).catch((e: unknown) => e);
    expect(thrown).toBe(offline);
    expect((thrown as Error).message).toBe("fetch failed");
  });
});
