import { describe, expect, it, vi } from "vitest";
import { whoami, whoamiHandler } from "../../src/commands/whoami.js";
import { CredentialError } from "../../src/errors.js";
import { ProxyError } from "../../src/lib/proxy-client.js";

interface FakeDeps {
  resolveIdentity: ReturnType<typeof vi.fn>;
  createProxyClient: ReturnType<typeof vi.fn>;
  env: NodeJS.ProcessEnv;
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
    ...overrides,
  };
}

describe("whoami SDK", () => {
  it("resolves identity then calls proxy /api/whoami", async () => {
    const deps = mkDeps();
    await whoami(deps);
    expect(deps.resolveIdentity).toHaveBeenCalledTimes(1);
    expect(deps.createProxyClient).toHaveBeenCalledTimes(1);
    const proxy = deps.createProxyClient.mock.results[0]?.value as {
      whoami: ReturnType<typeof vi.fn>;
    };
    expect(proxy.whoami).toHaveBeenCalledTimes(1);
  });

  it("uses default baseUrl when env override absent", async () => {
    const deps = mkDeps();
    await whoami(deps);
    const cfg = deps.createProxyClient.mock.calls[0][0];
    expect(cfg.baseUrl).toBe("https://uploads.freecode.camp");
  });

  it("respects UNIVERSE_PROXY_URL env override", async () => {
    const deps = mkDeps({
      env: { UNIVERSE_PROXY_URL: "https://staging.example.com" },
    });
    await whoami(deps);
    const cfg = deps.createProxyClient.mock.calls[0][0];
    expect(cfg.baseUrl).toBe("https://staging.example.com");
  });

  it("supplies bearer token resolved from identity chain", async () => {
    const deps = mkDeps();
    await whoami(deps);
    const cfg = deps.createProxyClient.mock.calls[0][0] as {
      getAuthToken: () => Promise<string> | string;
    };
    expect(await cfg.getAuthToken()).toBe("ghp_x");
  });

  it("returns CommandResult with envelope data", async () => {
    const deps = mkDeps();
    const result = await whoami(deps);
    expect(result.data.command).toBe("whoami");
    expect(result.data.success).toBe(true);
    expect(result.data.login).toBe("alice");
    expect(result.data.authorizedSitesCount).toBe(2);
    expect(result.data.identitySource).toBe("env_GITHUB_TOKEN");
    expect(result.data.proxyUrl).toBe("https://uploads.freecode.camp");
    // Site list must not appear in envelope
    expect(result.data.authorizedSites).toBeUndefined();
  });

  it("returns human-readable format string", async () => {
    const deps = mkDeps();
    const result = await whoami(deps);
    expect(result.format).toContain("alice");
    expect(result.format).toContain("env_GITHUB_TOKEN");
    expect(result.format).toContain("Authorized for 2 sites");
    expect(result.format).toContain("universe sites ls --mine");
    // Site slugs must NOT appear in whoami output
    expect(result.format).not.toContain("news");
    expect(result.format).not.toContain("certifications");
  });

  it("throws CredentialError when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(whoami(deps)).rejects.toThrow(CredentialError);
    expect(deps.createProxyClient).not.toHaveBeenCalled();
  });

  it("throws proxy errors directly", async () => {
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue({
        whoami: vi.fn().mockRejectedValue(new ProxyError(401, "unauth", "bad token")),
      }),
    });
    await expect(whoami(deps)).rejects.toThrow(ProxyError);
  });
});

describe("whoamiHandler", () => {
  it("calls logSuccess in text mode", async () => {
    const deps = { ...mkDeps(), logSuccess: vi.fn(), logError: vi.fn() };
    await whoamiHandler({ json: false }, deps);
    expect(deps.logSuccess).toHaveBeenCalled();
  });

  it("emits JSON envelope in json mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    await whoamiHandler({ json: true }, mkDeps());
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("whoami");
    expect(env.success).toBe(true);
    expect(env.login).toBe("alice");
  });

  it("routes CredentialError through outputError + exit", async () => {
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = {
      ...mkDeps({ resolveIdentity: vi.fn().mockResolvedValue(null) }),
      logError,
      exit,
    };
    await expect(whoamiHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(12); // EXIT_CREDENTIALS
    expect(logError).toHaveBeenCalledWith(expect.stringMatching(/login|identity/i));
  });

  it("routes proxy errors through outputError + exit", async () => {
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = {
      ...mkDeps({
        createProxyClient: vi.fn().mockReturnValue({
          whoami: vi
            .fn()
            .mockRejectedValue(
              new ProxyError(403, "user_unauthorized", "caller is not on the required team"),
            ),
        }),
      }),
      logError,
      exit,
    };
    await expect(whoamiHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(12);
    const msg = (logError.mock.calls[0]?.[0] as string) ?? "";
    expect(msg).toContain("whoami failed (user_unauthorized)");
    expect(msg).toContain("read:org");
  });

  it("emits error envelope in JSON mode on proxy failure", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const deps = {
      ...mkDeps({
        createProxyClient: vi.fn().mockReturnValue({
          whoami: vi.fn().mockRejectedValue(new ProxyError(503, "upstream", "down")),
        }),
      }),
      logError: vi.fn(),
      exit,
    };

    await expect(whoamiHandler({ json: true }, deps)).rejects.toThrow("__exit__");
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.success).toBe(false);
    expect(env.error.code).toBe(13); // EXIT_STORAGE
    expect(env.error.message).toContain("down");
  });
});
