import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveWoodpeckerToken } from "../../src/credentials/woodpecker.js";
import { CredentialError } from "../../src/errors.js";

describe("resolveWoodpeckerToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the token from WOODPECKER_TOKEN env var", () => {
    vi.stubEnv("WOODPECKER_TOKEN", "abc123");
    expect(resolveWoodpeckerToken()).toBe("abc123");
  });

  it("throws CredentialError when WOODPECKER_TOKEN is unset", () => {
    vi.stubEnv("WOODPECKER_TOKEN", "");
    expect(() => resolveWoodpeckerToken()).toThrow(CredentialError);
  });

  it("throws CredentialError when WOODPECKER_TOKEN is whitespace-only", () => {
    vi.stubEnv("WOODPECKER_TOKEN", "   \t  ");
    expect(() => resolveWoodpeckerToken()).toThrow(CredentialError);
  });

  it("trims surrounding whitespace from the token", () => {
    vi.stubEnv("WOODPECKER_TOKEN", "  abc123  ");
    expect(resolveWoodpeckerToken()).toBe("abc123");
  });

  it("includes guidance URL in the error message", () => {
    vi.stubEnv("WOODPECKER_TOKEN", "");
    try {
      resolveWoodpeckerToken();
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toMatch(/woodpecker\./);
      expect((err as Error).message).toMatch(/token|tokens/);
    }
  });
});
