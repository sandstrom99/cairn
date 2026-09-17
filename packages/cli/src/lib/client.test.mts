import { describe, expect, it, vi } from "vitest";
import { type CairnClient, api, withSecret } from "./client.mts";

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
