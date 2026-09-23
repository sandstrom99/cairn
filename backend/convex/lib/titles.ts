// titles.ts: what "same title" means (docs/design.md §7, §12). Two titles are the same
// work when they are equal after normalising, or within NEAR_TITLE_DISTANCE edits of each
// other after it. `issues.create` hands the matches back before a duplicate exists and
// `review.get` lists any pair that got through; both read the test here, so the two
// cannot disagree about which titles are near-identical.

/** Two live titles within this Levenshtein distance after normalisation are near-identical (§7). */
export const NEAR_TITLE_DISTANCE = 2;

/**
 * Lowercase, every run of anything but letters and digits one space, trimmed: what "same
 * title" means. Letters in any script, so `næste` and `naste` stay two words apart.
 */
export const normalise = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Edit distance, two rows at a time. The titles compared are a line long. */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = row;
  }
  return prev[b.length]!;
}

/** Equal after normalising, or within NEAR_TITLE_DISTANCE of each other after it (design §12). */
export const nearIdentical = (a: string, b: string): boolean => {
  const left = normalise(a);
  const right = normalise(b);
  return left === right || distance(left, right) <= NEAR_TITLE_DISTANCE;
};
