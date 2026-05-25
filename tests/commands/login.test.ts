import { describe, expect, it, vi } from "vitest";
import { login } from "../../src/commands/login.js";
import { DEFAULT_GH_CLIENT_ID } from "../../src/lib/constants.js";

interface FakeDeps {
  runDeviceFlow: ReturnType<typeof vi.fn>;
  saveToken: ReturnType<typeof vi.fn>;
  loadToken: ReturnType<typeof vi.fn>;
  createProxyClient: ReturnType<typeof vi.fn>;
  env: NodeJS.ProcessEnv;
  logSuccess: ReturnType<typeof vi.fn>;
  logInfo: ReturnType<typeof vi.fn>;
  logWarn: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
}

/**
 * Default fake proxy client — whoami returns one authorized site so
 * the self-check stays quiet for tests that don't care about it.
 * Override via `createProxyClient` to test the 0-sites warning path
 * or self-check failures.
 */
function mkFakeProxyClient(
  whoamiImpl?: () => Promise<{
    login: string;
    authorizedSites: Array<{ slug: string; teams: string[] }>;
  }>,
) {
  return vi.fn().mockReturnValue({
    whoami:
      whoamiImpl ??
      (async () => ({
        login: "test-user",
        authorizedSites: [{ slug: "test-site", teams: ["staff"] }],
      })),
  });
}

function mkDeps(overrides: Partial<FakeDeps> = {}): FakeDeps {
  return {
    runDeviceFlow: vi.fn().mockResolvedValue("ghu_secret"),
    saveToken: vi.fn().mockResolvedValue(undefined),
    loadToken: vi.fn().mockResolvedValue(null),
    createProxyClient: mkFakeProxyClient(),
    env: { UNIVERSE_GH_CLIENT_ID: "Iv1.test" },
    logSuccess: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

describe("login command", () => {
  it("runs device flow and persists token on success", async () => {
    const deps = mkDeps();
    await login({ json: false }, deps);
    expect(deps.runDeviceFlow).toHaveBeenCalledTimes(1);
    expect(deps.saveToken).toHaveBeenCalledWith("ghu_secret");
    expect(deps.logSuccess).toHaveBeenCalled();
  });

  it("passes UNIVERSE_GH_CLIENT_ID env to device flow", async () => {
    const deps = mkDeps({
      env: { UNIVERSE_GH_CLIENT_ID: "Iv1.real_client" },
    });
    await login({ json: false }, deps);
    const arg = deps.runDeviceFlow.mock.calls[0][0];
    expect(arg.clientId).toBe("Iv1.real_client");
  });

  it("displays user code and verification uri to operator (text mode)", async () => {
    const deps = mkDeps({
      runDeviceFlow: vi
        .fn()
        .mockImplementation(
          async (opts: {
            onPrompt: (p: {
              userCode: string;
              verificationUri: string;
              expiresIn: number;
            }) => void;
          }) => {
            await opts.onPrompt({
              userCode: "ABCD-1234",
              verificationUri: "https://github.com/login/device",
              expiresIn: 900,
            });
            return "ghu_secret";
          },
        ),
    });
    await login({ json: false }, deps);
    const calls = deps.logInfo.mock.calls.map((c) => c[0]).join("\n");
    expect(calls).toContain("ABCD-1234");
    expect(calls).toContain("https://github.com/login/device");
  });

  it("emits JSON envelope with prompt then success in JSON mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });

    const deps = mkDeps({
      runDeviceFlow: vi
        .fn()
        .mockImplementation(
          async (opts: {
            onPrompt: (p: {
              userCode: string;
              verificationUri: string;
              expiresIn: number;
            }) => void;
          }) => {
            await opts.onPrompt({
              userCode: "X",
              verificationUri: "Y",
              expiresIn: 900,
            });
            return "tok";
          },
        ),
    });

    await login({ json: true }, deps);
    writeSpy.mockRestore();

    const lines = stdout.join("").trim().split("\n");
    const promptLine = JSON.parse(lines[0]!);
    expect(promptLine.command).toBe("login");
    expect(promptLine.success).toBe(true);
    expect(promptLine.userCode).toBe("X");
    expect(promptLine.verificationUri).toBe("Y");

    const successLine = JSON.parse(lines[1]!);
    expect(successLine.command).toBe("login");
    expect(successLine.success).toBe(true);
    expect(successLine.stored).toBe(true);
  });

  it("falls back to DEFAULT_GH_CLIENT_ID when env is unset", async () => {
    const deps = mkDeps({ env: {} });
    await login({ json: false }, deps);
    expect(deps.runDeviceFlow).toHaveBeenCalledTimes(1);
    const arg = deps.runDeviceFlow.mock.calls[0][0];
    expect(arg.clientId).toBe(DEFAULT_GH_CLIENT_ID);
    expect(deps.exit).not.toHaveBeenCalled();
  });

  it("falls back to DEFAULT_GH_CLIENT_ID when env is empty string", async () => {
    const deps = mkDeps({ env: { UNIVERSE_GH_CLIENT_ID: "" } });
    await login({ json: false }, deps);
    expect(deps.runDeviceFlow).toHaveBeenCalledTimes(1);
    const arg = deps.runDeviceFlow.mock.calls[0][0];
    expect(arg.clientId).toBe(DEFAULT_GH_CLIENT_ID);
    expect(deps.exit).not.toHaveBeenCalled();
  });

  it("falls back to DEFAULT_GH_CLIENT_ID when env is whitespace", async () => {
    const deps = mkDeps({ env: { UNIVERSE_GH_CLIENT_ID: "   " } });
    await login({ json: false }, deps);
    expect(deps.runDeviceFlow).toHaveBeenCalledTimes(1);
    const arg = deps.runDeviceFlow.mock.calls[0][0];
    expect(arg.clientId).toBe(DEFAULT_GH_CLIENT_ID);
  });

  it("refuses to overwrite existing token without --force", async () => {
    const deps = mkDeps({
      loadToken: vi.fn().mockResolvedValue("existing"),
    });
    await expect(login({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.runDeviceFlow).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(18);
    expect(deps.logError).toHaveBeenCalledWith(expect.any(String));
  });

  it("overwrites existing token when --force passed", async () => {
    const deps = mkDeps({
      loadToken: vi.fn().mockResolvedValue("existing"),
    });
    await login({ json: false, force: true }, deps);
    expect(deps.runDeviceFlow).toHaveBeenCalledTimes(1);
    expect(deps.saveToken).toHaveBeenCalledWith("ghu_secret");
  });

  it("propagates device-flow failure as error exit", async () => {
    const deps = mkDeps({
      runDeviceFlow: vi.fn().mockRejectedValue(new Error("denied")),
    });
    await expect(login({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.saveToken).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(12);
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringContaining("denied"),
    );
  });

  describe("post-login self-check", () => {
    it("stays quiet when whoami reports authorized sites", async () => {
      const deps = mkDeps();
      await login({ json: false }, deps);
      expect(deps.logWarn).not.toHaveBeenCalled();
      expect(deps.logSuccess).toHaveBeenCalled();
    });

    it("warns in text mode when whoami reports 0 authorized sites", async () => {
      const deps = mkDeps({
        createProxyClient: mkFakeProxyClient(async () => ({
          login: "newbie",
          authorizedSites: [],
        })),
      });
      await login({ json: false }, deps);
      expect(deps.logWarn).toHaveBeenCalledTimes(1);
      const warning = deps.logWarn.mock.calls[0]![0] as string;
      expect(warning).toContain("0 authorized sites");
      expect(warning).toContain("GitHub App");
      expect(warning).toContain("freeCodeCamp-Universe");
    });

    it("includes authorizedSitesCount + warning in JSON success envelope", async () => {
      const stdout: string[] = [];
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: unknown) => {
          stdout.push(String(chunk));
          return true;
        });

      const deps = mkDeps({
        createProxyClient: mkFakeProxyClient(async () => ({
          login: "newbie",
          authorizedSites: [],
        })),
      });
      await login({ json: true }, deps);
      writeSpy.mockRestore();

      const lines = stdout.join("").trim().split("\n");
      const successLine = JSON.parse(lines[0]!);
      expect(successLine.stored).toBe(true);
      expect(successLine.authorizedSitesCount).toBe(0);
      expect(successLine.warning).toContain("0 authorized sites");
    });

    it("omits warning from JSON envelope when sites count > 0", async () => {
      const stdout: string[] = [];
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: unknown) => {
          stdout.push(String(chunk));
          return true;
        });

      const deps = mkDeps();
      await login({ json: true }, deps);
      writeSpy.mockRestore();

      const lines = stdout.join("").trim().split("\n");
      const successLine = JSON.parse(lines[0]!);
      expect(successLine.stored).toBe(true);
      expect(successLine.authorizedSitesCount).toBe(1);
      expect(successLine.warning).toBeUndefined();
    });

    it("login still succeeds when whoami throws (no warning, no error)", async () => {
      const deps = mkDeps({
        createProxyClient: mkFakeProxyClient(async () => {
          throw new Error("network down");
        }),
      });
      await login({ json: false }, deps);
      expect(deps.saveToken).toHaveBeenCalledWith("ghu_secret");
      expect(deps.logSuccess).toHaveBeenCalled();
      expect(deps.logWarn).not.toHaveBeenCalled();
      expect(deps.logError).not.toHaveBeenCalled();
      expect(deps.exit).not.toHaveBeenCalled();
    });
  });
});
