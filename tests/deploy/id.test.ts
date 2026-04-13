import { describe, it, expect, vi, afterEach } from "vitest";
import { generateDeployId } from "../../src/deploy/id.js";

describe("generateDeployId", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns format YYYYMMDD-HHMMSS-{git7} with UTC time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T12:00:00Z"));

    const result = generateDeployId("abc1234def5678");
    expect(result).toBe("20260413-120000-abc1234");
  });

  it("uses first 7 characters of git hash", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T08:30:45Z"));

    const result = generateDeployId("fedcba9876543210");
    expect(result).toBe("20260115-083045-fedcba9");
  });

  it("uses 'nogit' suffix when gitHash is undefined and force is true", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T12:00:00Z"));

    const result = generateDeployId(undefined, true);
    expect(result).toBe("20260413-120000-nogit");
  });

  it("throws when gitHash is undefined and force is false", () => {
    expect(() => generateDeployId(undefined, false)).toThrow();
  });

  it("throws when gitHash is undefined and force is not provided", () => {
    expect(() => generateDeployId(undefined)).toThrow();
  });

  it("uses UTC time, not local time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:59:59Z"));

    const result = generateDeployId("aaa1111");
    expect(result).toBe("20261231-235959-aaa1111");
  });
});
