import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SITE_NAME_MAX_LENGTH,
  SITE_NAME_REGEX,
  validateSiteName,
} from "../../src/validation/site-name.js";

describe("SITE_NAME_REGEX", () => {
  it("is the RFC-1123-style lowercase-only regex", () => {
    expect(SITE_NAME_REGEX.source).toBe("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$");
    expect(SITE_NAME_REGEX.flags).toBe("");
  });
});

describe("SITE_NAME_MAX_LENGTH", () => {
  it("is 50", () => {
    expect(SITE_NAME_MAX_LENGTH).toBe(50);
  });
});

describe("validateSiteName (hard rules)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts typical valid names", () => {
    for (const n of ["hello-world", "docs", "a", "foo123", "a-b-c", "x1"]) {
      expect(() => validateSiteName(n)).not.toThrow();
    }
  });

  it("rejects empty string", () => {
    expect(() => validateSiteName("")).toThrow(/1-50 chars|1–50 chars/);
  });

  it("rejects name longer than 50 chars", () => {
    expect(() => validateSiteName("a".repeat(51))).toThrow(
      /1-50 chars|1–50 chars/,
    );
  });

  it("accepts name exactly 50 chars", () => {
    expect(() => validateSiteName("a".repeat(50))).not.toThrow();
  });

  it("rejects uppercase letters", () => {
    expect(() => validateSiteName("Hello")).toThrow(
      /lowercase|SITE_NAME_REGEX|must match/,
    );
  });

  it("rejects leading hyphen", () => {
    expect(() => validateSiteName("-hello")).toThrow();
  });

  it("rejects trailing hyphen", () => {
    expect(() => validateSiteName("hello-")).toThrow();
  });

  it("rejects double-hyphen (reserved for preview routing)", () => {
    expect(() => validateSiteName("hello--world")).toThrow(/"--"/);
  });

  it("rejects dots and underscores", () => {
    expect(() => validateSiteName("foo.bar")).toThrow();
    expect(() => validateSiteName("foo_bar")).toThrow();
  });
});

describe("validateSiteName (soft warnings)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns on preview- prefix but does not throw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => validateSiteName("preview-foo")).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/preview/);
  });

  it("warns on -preview suffix but does not throw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => validateSiteName("foo-preview")).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn on non-preview-related names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateSiteName("hello-world");
    expect(warn).not.toHaveBeenCalled();
  });
});
