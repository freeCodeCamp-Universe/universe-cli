/**
 * Minimal string-similarity helpers for "did you mean?" hints in
 * user-facing error messages. No runtime dep — Damerau-Levenshtein
 * is O(m·n) which is trivial for slug-sized inputs.
 */

/**
 * Damerau-Levenshtein edit distance. Counts insertions, deletions,
 * substitutions, and adjacent-character transpositions, each as one
 * edit.
 */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/**
 * Best did-you-mean candidate from `candidates`, or `null` when none
 * are close enough.
 *
 * Resolution order:
 *   1. Case-insensitive substring match (either direction) wins
 *      outright — covers the common "appended suffix" typo class
 *      (e.g. `hello-universe-1` → `hello-universe`).
 *   2. Damerau-Levenshtein within `threshold` (default 2) — covers
 *      single-character typos and adjacent transpositions.
 *
 * Returned value preserves the original casing of the matched
 * candidate.
 */
export function suggest(
  target: string,
  candidates: readonly string[],
  threshold = 2,
): string | null {
  if (candidates.length === 0) return null;

  const lc = target.toLowerCase();
  const sub = candidates.find((c) => {
    const clc = c.toLowerCase();
    return clc.includes(lc) || lc.includes(clc);
  });
  if (sub) return sub;

  let best: string | null = null;
  let bestD = threshold + 1;
  for (const c of candidates) {
    const d = editDistance(lc, c.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return bestD <= threshold ? best : null;
}
