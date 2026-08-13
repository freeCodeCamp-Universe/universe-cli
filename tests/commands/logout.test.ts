import { describe, expect, it, vi } from "vitest";
import { logout, logoutHandler } from "../../src/commands/logout.js";

interface FakeDeps {
  loadToken: ReturnType<typeof vi.fn>;
  deleteToken: ReturnType<typeof vi.fn>;
}

function mkDeps(overrides: Partial<FakeDeps> = {}): FakeDeps {
  return {
    loadToken: vi.fn().mockResolvedValue("existing"),
    deleteToken: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("logout SDK", () => {
  it("deletes stored token and returns removed=true when token existed", async () => {
    const deps = mkDeps();
    const result = await logout(deps);
    expect(deps.deleteToken).toHaveBeenCalledTimes(1);
    expect(result.data.removed).toBe(true);
    expect(result.data.command).toBe("logout");
    expect(result.data.success).toBe(true);
    expect(result.format).toContain("Logged out");
  });

  it("returns removed=false when no token was stored", async () => {
    const deps = mkDeps({ loadToken: vi.fn().mockResolvedValue(null) });
    const result = await logout(deps);
    expect(deps.deleteToken).toHaveBeenCalledTimes(1);
    expect(result.data.removed).toBe(false);
    expect(result.format.toLowerCase()).toContain("no token");
  });
});

describe("logoutHandler", () => {
  it("calls logSuccess in text mode when token existed", async () => {
    const deps = { ...mkDeps(), logSuccess: vi.fn(), logInfo: vi.fn() };
    await logoutHandler({ json: false }, deps);
    expect(deps.logSuccess).toHaveBeenCalled();
  });

  it("calls logInfo in text mode when no token existed", async () => {
    const deps = {
      ...mkDeps({ loadToken: vi.fn().mockResolvedValue(null) }),
      logSuccess: vi.fn(),
      logInfo: vi.fn(),
    };
    await logoutHandler({ json: false }, deps);
    expect(deps.logInfo).toHaveBeenCalled();
  });

  it("emits JSON envelope in json mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    await logoutHandler({ json: true }, mkDeps());
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("logout");
    expect(env.success).toBe(true);
    expect(env.removed).toBe(true);
  });

  it("emits envelope with removed=false when no token existed (JSON mode)", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    await logoutHandler({ json: true }, mkDeps({ loadToken: vi.fn().mockResolvedValue(null) }));
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.removed).toBe(false);
  });
});
