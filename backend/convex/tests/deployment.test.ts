// What the deployment says about itself (deployment.ts): the commit `#push:cloud` recorded
// as `CAIRN_PUSHED_FROM` and the name it pushed under as `CAIRN_NAME`, each read on every
// call, or null where nothing recorded one.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { fresh } from "./test.fixtures";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deployment.pushedFrom", () => {
  it("is the commit #push:cloud recorded", async () => {
    vi.stubEnv("CAIRN_PUSHED_FROM", "0123456789abcdef0123456789abcdef01234567-dirty");
    expect(await fresh().query(api.deployment.pushedFrom, {})).toBe(
      "0123456789abcdef0123456789abcdef01234567-dirty",
    );
  });

  it("is null where nothing recorded one", async () => {
    expect(await fresh().query(api.deployment.pushedFrom, {})).toBeNull();
  });
});

describe("deployment.name", () => {
  it("is the name #push:cloud recorded", async () => {
    vi.stubEnv("CAIRN_NAME", "invyte");
    expect(await fresh().query(api.deployment.name, {})).toBe("invyte");
  });

  it("is null where nothing recorded one", async () => {
    expect(await fresh().query(api.deployment.name, {})).toBeNull();
  });
});
