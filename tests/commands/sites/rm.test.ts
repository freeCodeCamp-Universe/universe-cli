import { describe, expect, it, vi } from "vitest";
import { sitesRm, sitesRmHandler } from "../../../src/commands/sites/rm.js";
import { CredentialError } from "../../../src/errors.js";
import { ProxyError } from "../../../src/lib/proxy-client.js";

function mkProxy() {
  return {
    whoami: vi.fn(),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    deployFinalize: vi.fn(),
    siteDeploys: vi.fn(),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
    registerSite: vi.fn(),
    listSites: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn().mockResolvedValue(undefined),
  };
}

function mkDeps(overrides: Record<string, unknown> = {}) {
  return {
    env: {} as NodeJS.ProcessEnv,
    resolveIdentity: vi.fn().mockResolvedValue({
      token: "ghp_x",
      source: "env_GITHUB_TOKEN",
    }),
    createProxyClient: vi.fn().mockReturnValue(mkProxy()),
    ...overrides,
  };
}

describe("sitesRm SDK", () => {
  it("calls deleteSite with slug", async () => {
    const deps = mkDeps();
    await sitesRm({ slug: "blog" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.deleteSite).toHaveBeenCalledWith({ slug: "blog" });
  });

  it("returns CommandResult with envelope and format", async () => {
    const deps = mkDeps();
    const result = await sitesRm({ slug: "blog" }, deps);
    expect(result.data.command).toBe("sites rm");
    expect(result.data.success).toBe(true);
    expect(result.data.slug).toBe("blog");
    expect(result.data.deleted).toBe(true);
    expect(result.data.identitySource).toBe("env_GITHUB_TOKEN");
    expect(result.format).toContain("Deleted blog");
  });

  it("throws UsageError on empty slug", async () => {
    const deps = mkDeps();
    await expect(sitesRm({ slug: "" }, deps)).rejects.toThrow(/slug is required/i);
  });

  it("throws CredentialError when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(sitesRm({ slug: "blog" }, deps)).rejects.toThrow(CredentialError);
  });

  it("throws proxy errors directly", async () => {
    const proxy = mkProxy();
    proxy.deleteSite = vi
      .fn()
      .mockRejectedValue(new ProxyError(404, "not_found", "site is not registered"));
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(sitesRm({ slug: "ghost" }, deps)).rejects.toThrow(ProxyError);
  });
});

describe("sitesRmHandler", () => {
  it("emits success envelope in JSON mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    const deps = mkDeps();
    await sitesRmHandler({ json: true, slug: "blog" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("sites rm");
    expect(env.success).toBe(true);
    expect(env.slug).toBe("blog");
    expect(env.deleted).toBe(true);
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("calls logSuccess in text mode", async () => {
    const logSuccess = vi.fn();
    const deps = { ...mkDeps(), logSuccess, logError: vi.fn() };
    await sitesRmHandler({ json: false, slug: "blog" }, deps);
    expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining("Deleted blog"));
  });

  it("rejects empty slug with EXIT_USAGE", async () => {
    const exit = vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = { ...mkDeps(), logError, exit };
    await expect(sitesRmHandler({ json: false, slug: "" }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(10);
    expect(logError).toHaveBeenCalledWith(expect.stringMatching(/slug is required/i));
  });

  it("maps proxy 404 not_found to surfaced code", async () => {
    const proxy = mkProxy();
    proxy.deleteSite = vi
      .fn()
      .mockRejectedValue(new ProxyError(404, "not_found", "site is not registered"));
    const exit = vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = {
      ...mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) }),
      logError,
      exit,
    };
    await expect(sitesRmHandler({ json: false, slug: "ghost" }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(10);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("not_found"));
  });

  it("maps proxy 403 user_unauthorized to EXIT_CREDENTIALS", async () => {
    const proxy = mkProxy();
    proxy.deleteSite = vi
      .fn()
      .mockRejectedValue(new ProxyError(403, "user_unauthorized", "not on staff team"));
    const exit = vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = {
      ...mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) }),
      logError,
      exit,
    };
    await expect(sitesRmHandler({ json: false, slug: "blog" }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(12);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("user_unauthorized"));
  });
});
