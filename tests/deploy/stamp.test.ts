import { describe, expect, it } from "vitest";
import {
  deployIdSentinelSource,
  sentinelSourceOf,
  stampSha,
  type SentinelSource,
  type ShaSource,
} from "../../src/deploy/stamp.js";

const HEAD = "abc1234def5678901234567890abcdef12345678";

const clean = { hash: HEAD, dirty: false };
const dirty = { hash: HEAD, dirty: true };
const noGit = { hash: null, dirty: false };

describe("stampSha", () => {
  it("uses the HEAD hash for a clean tree with no --dir", () => {
    expect(stampSha(clean, false)).toEqual({ sha: HEAD, source: "head" });
  });

  it("stamps a dirty tree instead of the HEAD hash", () => {
    const stamp = stampSha(dirty, false);
    expect(stamp.source).toBe<ShaSource>("dirty");
    expect(stamp.sha).not.toBe(HEAD.slice(0, 7));
  });

  it("stamps a --dir override on a clean tree", () => {
    expect(stampSha(clean, true).source).toBe<ShaSource>("dirover");
  });

  it("prefers the dirty stamp over the --dir stamp", () => {
    expect(stampSha(dirty, true).source).toBe<ShaSource>("dirty");
  });

  it("falls back to the synthetic stamp outside a git repo even with --dir", () => {
    expect(stampSha(noGit, true).source).toBe<ShaSource>("synthetic");
  });

  it("falls back to the synthetic stamp outside a git repo without --dir", () => {
    expect(stampSha(noGit, false).source).toBe<ShaSource>("synthetic");
  });

  describe("artemis truncates the sha to 7 characters", () => {
    it("mints every non-head stamp at exactly 7 characters", () => {
      for (const stamp of [stampSha(dirty, false), stampSha(clean, true), stampSha(noGit, false)]) {
        expect(stamp.sha).toHaveLength(7);
      }
    });
  });

  describe("not hex", () => {
    it("mints no sentinel a real HEAD hash could prefix-match", () => {
      for (const stamp of [stampSha(dirty, false), stampSha(clean, true), stampSha(noGit, false)]) {
        expect(stamp.sha).not.toMatch(/^[0-9a-f]+$/);
      }
    });
  });

  describe("same second", () => {
    it("mints a distinct sha per call on every sentinel path", () => {
      for (const mint of [
        () => stampSha(dirty, false),
        () => stampSha(clean, true),
        () => stampSha(noGit, false),
      ]) {
        const seen = new Set(Array.from({ length: 200 }, () => mint().sha));
        expect(seen.size).toBeGreaterThan(198);
      }
    });
  });

  it("mints a sha artemis accepts", () => {
    for (const stamp of [
      stampSha(clean, false),
      stampSha(dirty, false),
      stampSha(clean, true),
      stampSha(noGit, false),
    ]) {
      expect(stamp.sha).toMatch(/^[A-Za-z0-9-]{1,64}$/);
    }
  });
});

describe("sentinelSourceOf", () => {
  it("names each sentinel prefix", () => {
    expect(sentinelSourceOf("dty1a2b")).toBe<SentinelSource>("dirty");
    expect(sentinelSourceOf("dov1a2b")).toBe<SentinelSource>("dirover");
    expect(sentinelSourceOf("nog1a2b")).toBe<SentinelSource>("synthetic");
  });

  it("refuses to claim head for a sha it did not mint", () => {
    expect(sentinelSourceOf(HEAD)).toBeNull();
    expect(sentinelSourceOf("abc1234")).toBeNull();
    expect(sentinelSourceOf("rA86019")).toBeNull();
  });

  it("round-trips every sentinel it mints", () => {
    for (const stamp of [stampSha(dirty, false), stampSha(clean, true), stampSha(noGit, false)]) {
      expect(sentinelSourceOf(stamp.sha)).toBe(stamp.source);
    }
  });
});

describe("deployIdSentinelSource", () => {
  it("reads the sentinel out of a deploy id", () => {
    expect(deployIdSentinelSource("20260512-120000-dty1a2b")).toBe<SentinelSource>("dirty");
  });

  it("returns null for a commit-stamped deploy id", () => {
    expect(deployIdSentinelSource("20260512-120000-abc1234")).toBeNull();
  });

  it("returns null for an unparseable deploy id", () => {
    expect(deployIdSentinelSource("not-a-deploy-id")).toBeNull();
  });
});
