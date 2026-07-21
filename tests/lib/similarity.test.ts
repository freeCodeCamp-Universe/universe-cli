import { describe, expect, it } from "vitest";
import { editDistance, suggest } from "../../src/lib/similarity.js";

describe("editDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(editDistance("abc", "abc")).toBe(0);
  });

  it("returns m when one operand is empty", () => {
    expect(editDistance("abc", "")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
  });

  it("counts insertion / deletion / substitution as 1 each", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("abc", "ab")).toBe(1);
    expect(editDistance("abc", "abcd")).toBe(1);
  });

  it("counts adjacent transposition as 1 edit (Damerau)", () => {
    expect(editDistance("ab", "ba")).toBe(1);
    expect(editDistance("hello", "hlelo")).toBe(1);
  });
});

describe("suggest", () => {
  it("returns null when the candidate list is empty", () => {
    expect(suggest("foo", [])).toBeNull();
  });

  it("prefers substring match over edit distance", () => {
    expect(suggest("hello-universe-1", ["hello-universe", "gomoku", "test"])).toBe(
      "hello-universe",
    );
  });

  it("matches substring in either direction, case-insensitively", () => {
    expect(suggest("Hello", ["hello-universe"])).toBe("hello-universe");
    expect(suggest("hello-universe-prod", ["hello"])).toBe("hello");
  });

  it("falls back to edit distance within threshold", () => {
    expect(suggest("gomku", ["gomoku", "checkers"])).toBe("gomoku");
  });

  it("returns null when nothing is within threshold", () => {
    expect(suggest("forum", ["gomoku", "test", "checkers"])).toBeNull();
  });

  it("respects a custom threshold", () => {
    expect(suggest("xyz", ["abc"], 3)).toBe("abc");
    expect(suggest("xyz", ["abc"], 2)).toBeNull();
  });
});
