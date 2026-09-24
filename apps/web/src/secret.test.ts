import { describe, expect, it } from "vitest";
import { SECRET_KEY, devSecret, readSecret, writeSecret } from "./secret.ts";
import { fakeStorage, throwingStorage } from "./storage.fixtures.ts";

describe("readSecret and writeSecret", () => {
  it("round-trips a secret under one key", () => {
    const storage = fakeStorage();
    writeSecret("s3cret", storage);
    expect(storage.entries.get(SECRET_KEY)).toBe("s3cret");
    expect(readSecret(storage)).toBe("s3cret");
  });

  it("trims, and a whitespace-only value removes the key", () => {
    const storage = fakeStorage();
    writeSecret("  s3cret  ", storage);
    expect(readSecret(storage)).toBe("s3cret");
    writeSecret("   ", storage);
    expect(storage.entries.has(SECRET_KEY)).toBe(false);
    expect(readSecret(storage)).toBeUndefined();
  });

  it("treats a storage that throws as no storage at all", () => {
    expect(readSecret(throwingStorage)).toBeUndefined();
    expect(() => writeSecret("s3cret", throwingStorage)).not.toThrow();
    expect(() => writeSecret("", throwingStorage)).not.toThrow();
  });

  it("does the same with no storage", () => {
    expect(readSecret(undefined)).toBeUndefined();
    expect(() => writeSecret("s3cret", undefined)).not.toThrow();
  });
});

describe("devSecret", () => {
  it("is undefined under vp test, whatever CAIRN_SECRET this machine holds", () => {
    expect(devSecret()).toBeUndefined();
  });
});
