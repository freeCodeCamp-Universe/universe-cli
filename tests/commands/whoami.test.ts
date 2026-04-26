import { describe, expect, it, vi } from "vitest";
import { whoami } from "../../src/commands/whoami.js";
import { ProxyError } from "../../src/lib/proxy-client.js";

interface FakeDeps {
  resolveIdentity: ReturnType<typeof vi.fn>;
  createProxyClient: ReturnType<typeof vi.fn>;
  env: NodeJS.ProcessEnv;
  logSuccess: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
}

function mkDeps(overrides: Partial<FakeDeps> = {}): FakeDeps {
  const proxyClient = {
    whoami: vi.fn().mockResolvedValue({
      login: "alice",
      authorizedSites: ["news", "certifications"],
    }),
  };
  return {
    resolveIdentity: vi.fn().mockResolvedValue({
      token: "ghp_x",
      source: "env_GITHUB_TOKEN",
    }),
    createProxyClient: vi.fn().mockReturnValue(proxyClient),
    env: {},
    logSuccess: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

describe("whoami command", () => {
  it("resolves identity then calls proxy /api/whoami", async () => {
    const deps = mkDeps();
    await whoami({ json: false }, deps);
    expect(deps.resolveIdentity).toHaveBeenCalledTimes(1);
    expect(deps.createProxyClient).toHaveBeenCalledTimes(1);
    const proxy = deps.createProxyClient.mock.results[0]?.value as {
      whoami: ReturnType<typeof vi.fn>;
    };
    expect(proxy.whoami).toHaveBeenCalledTimes(1);
  });

  it("uses default baseUrl when env override absent", async () => {
    const deps = mkDeps();
    await whoami({ json: false }, deps);
    const cfg = deps.createProxyClient.mock.calls[0][0];
    expect(cfg.baseUrl).toBe("https://uploads.freecode.camp");
  });

  it("respects UNIVERSE_PROXY_URL env override", async () => {
    const deps = mkDeps({
      env: { UNIVERSE_PROXY_URL: "https://staging.example.com" },
    });
    await whoami({ json: false }, deps);
    const cfg = deps.createProxyClient.mock.calls[0][0];
    expect(cfg.baseUrl).toBe("https://staging.example.com");
  });

  it("supplies bearer token resolved from identity chain", async () => {
    const deps = mkDeps();
    await whoami({ json: false }, deps);
    const cfg = deps.createProxyClient.mock.calls[0][0] as {
      getAuthToken: () => Promise<string> | string;
    };
    expect(await cfg.getAuthToken()).toBe("ghp_x");
  });

  it("emits success envelope in JSON mode (login + sites + source)", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });

    const deps = mkDeps();
    await whoami({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("whoami");
    expect(env.success).toBe(true);
    expect(env.login).toBe("alice");
    expect(env.authorizedSites).toEqual(["news", "certifications"]);
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("prints login + sites + source in text mode", async () => {
    const deps = mkDeps();
    await whoami({ json: false }, deps);
    const msg = deps.logSuccess.mock.calls[0]?.[0] ?? "";
    expect(msg).toContain("alice");
    expect(msg).toContain("news");
    expect(msg).toContain("certifications");
    expect(msg).toContain("env_GITHUB_TOKEN");
  });

  it("errors with EXIT_CREDENTIALS when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(whoami({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.createProxyClient).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(
      12,
      expect.stringMatching(/login|identity/i),
    );
  });

  it("propagates proxy 401 as EXIT_CREDENTIALS", async () => {
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue({
        whoami: vi
          .fn()
          .mockRejectedValue(new ProxyError(401, "unauth", "bad token")),
      }),
    });
    await expect(whoami({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(
      12,
      expect.stringContaining("bad token"),
    );
  });

  it("emits error envelope in JSON mode on proxy failure", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });

    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue({
        whoami: vi
          .fn()
          .mockRejectedValue(new ProxyError(503, "upstream", "down")),
      }),
    });

    await expect(whoami({ json: true }, deps)).rejects.toThrow("__exit__");
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.success).toBe(false);
    expect(env.error.code).toBe(13); // EXIT_STORAGE
    expect(env.error.message).toContain("down");
  });
});
