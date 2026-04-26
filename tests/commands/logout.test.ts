import { describe, expect, it, vi } from "vitest";
import { logout } from "../../src/commands/logout.js";

interface FakeDeps {
  loadToken: ReturnType<typeof vi.fn>;
  deleteToken: ReturnType<typeof vi.fn>;
  logSuccess: ReturnType<typeof vi.fn>;
  logInfo: ReturnType<typeof vi.fn>;
}

function mkDeps(overrides: Partial<FakeDeps> = {}): FakeDeps {
  return {
    loadToken: vi.fn().mockResolvedValue("existing"),
    deleteToken: vi.fn().mockResolvedValue(undefined),
    logSuccess: vi.fn(),
    logInfo: vi.fn(),
    ...overrides,
  };
}

describe("logout command", () => {
  it("deletes stored token and reports success (text mode)", async () => {
    const deps = mkDeps();
    await logout({ json: false }, deps);
    expect(deps.deleteToken).toHaveBeenCalledTimes(1);
    expect(deps.logSuccess).toHaveBeenCalled();
  });

  it("reports 'no token' when nothing was stored (text mode)", async () => {
    const deps = mkDeps({ loadToken: vi.fn().mockResolvedValue(null) });
    await logout({ json: false }, deps);
    expect(deps.deleteToken).toHaveBeenCalledTimes(1); // idempotent
    const messages = [
      ...deps.logSuccess.mock.calls.map((c) => c[0]),
      ...deps.logInfo.mock.calls.map((c) => c[0]),
    ].join("\n");
    expect(messages.toLowerCase()).toContain("no token");
  });

  it("emits success envelope in JSON mode (token existed)", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });

    const deps = mkDeps();
    await logout({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("logout");
    expect(env.success).toBe(true);
    expect(env.removed).toBe(true);
  });

  it("emits envelope with removed=false when no token existed (JSON mode)", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });

    const deps = mkDeps({ loadToken: vi.fn().mockResolvedValue(null) });
    await logout({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("logout");
    expect(env.success).toBe(true);
    expect(env.removed).toBe(false);
  });
});
