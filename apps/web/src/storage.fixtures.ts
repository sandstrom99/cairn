// storage.fixtures.ts: the two localStorages the tests of secret.ts and column.ts hand in,
// one that works without a DOM and one that refuses every touch. Nothing in the app imports it.

/** A localStorage that is a Map, so a test needs no DOM. */
export function fakeStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  };
}

/** A localStorage in a browser that refuses it: every method throws. */
export const throwingStorage = {
  getItem: (): string => {
    throw new Error("denied");
  },
  setItem: (): void => {
    throw new Error("denied");
  },
  removeItem: (): void => {
    throw new Error("denied");
  },
};
