import { describe, expect, it, vi } from "vitest";
import { sitesLs, sitesLsHandler } from "../../../src/commands/sites/ls.js";
import { CredentialError } from "../../../src/errors.js";
import { ProxyError } from "../../../src/lib/proxy-client.js";

const ROWS = [
  {
    slug: "alpha",
    teams: ["staff"],
    createdAt: "2026-05-10T00:00:00Z",
    updatedAt: "2026-05-10T00:00:00Z",
    createdBy: "alice",
  },
  {
    slug: "beta",
    teams: ["news-editors", "platform"],
    createdAt: "2026-05-10T00:00:00Z",
    updatedAt: "2026-05-11T00:00:00Z",
    createdBy: "bob",
  },
];

function mkProxy(rows = ROWS) {
  return {
    whoami: vi.fn().mockResolvedValue({
      login: "alice",
      authorizedSites: ["alpha"],
    }),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    deployFinalize: vi.fn(),
    siteDeploys: vi.fn(),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
    registerSite: vi.fn(),
    listSites: vi.fn().mockResolvedValue(rows),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
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

describe("sitesLs SDK", () => {
  it("calls listSites and returns CommandResult with table format", async () => {
    const deps = mkDeps();
    const result = await sitesLs({}, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.listSites).toHaveBeenCalledOnce();
    expect(result.format).toContain("alpha");
    expect(result.format).toContain("beta");
    expect(result.format).toContain("staff");
    expect(result.format).toContain("news-editors,platform");
  });

  it("returns 'No registered sites.' format for empty list", async () => {
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(mkProxy([])),
    });
    const result = await sitesLs({}, deps);
    expect(result.format).toBe("No registered sites.");
  });

  it("returns envelope with count, scope, sites, and identitySource", async () => {
    const deps = mkDeps();
    const result = await sitesLs({}, deps);
    expect(result.data.command).toBe("sites ls");
    expect(result.data.success).toBe(true);
    expect(result.data.count).toBe(2);
    expect(result.data.scope).toBe("all");
    expect(result.data.sites).toEqual(ROWS);
    expect(result.data.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("filters to authorized sites when mine=true", async () => {
    const deps = mkDeps();
    const result = await sitesLs({ mine: true }, deps);
    expect(result.data.scope).toBe("mine");
    expect(result.data.count).toBe(1);
    const sites = result.data.sites as typeof ROWS;
    expect(sites.map((s) => s.slug)).toEqual(["alpha"]);
  });

  it("throws CredentialError when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(sitesLs({}, deps)).rejects.toThrow(CredentialError);
    expect(deps.createProxyClient).not.toHaveBeenCalled();
  });

  it("throws proxy errors directly", async () => {
    const proxy = mkProxy();
    proxy.listSites = vi
      .fn()
      .mockRejectedValue(new ProxyError(502, "registry_read_failed", "valkey down"));
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(sitesLs({}, deps)).rejects.toThrow(ProxyError);
  });
});

describe("sitesLsHandler", () => {
  it("calls logSuccess in text mode", async () => {
    const deps = { ...mkDeps(), logSuccess: vi.fn(), logError: vi.fn() };
    await sitesLsHandler({ json: false }, deps);
    expect(deps.logSuccess).toHaveBeenCalledOnce();
    const tableArg = deps.logSuccess.mock.calls[0][0] as string;
    expect(tableArg).toContain("alpha");
    expect(tableArg).toContain("beta");
  });

  it("emits JSON envelope in json mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    const deps = mkDeps();
    await sitesLsHandler({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("sites ls");
    expect(env.success).toBe(true);
    expect(env.count).toBe(2);
    expect(env.sites).toEqual(ROWS);
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
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
    await expect(sitesLsHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(12); // EXIT_CREDENTIALS
    expect(logError).toHaveBeenCalledWith(expect.stringMatching(/login|identity/i));
  });

  it("maps proxy 502 registry_read_failed to EXIT_STORAGE", async () => {
    const proxy = mkProxy();
    proxy.listSites = vi
      .fn()
      .mockRejectedValue(new ProxyError(502, "registry_read_failed", "valkey down"));
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = {
      ...mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) }),
      logError,
      exit,
    };
    await expect(sitesLsHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(13); // EXIT_STORAGE
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("registry_read_failed"));
  });

  it("emits error envelope in JSON mode on proxy failure", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    const proxy = mkProxy();
    proxy.listSites = vi
      .fn()
      .mockRejectedValue(new ProxyError(502, "registry_read_failed", "valkey down"));
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const deps = {
      ...mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) }),
      logError: vi.fn(),
      exit,
    };

    await expect(sitesLsHandler({ json: true }, deps)).rejects.toThrow("__exit__");
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.success).toBe(false);
    expect(env.error.code).toBe(13); // EXIT_STORAGE
    expect(env.error.message).toContain("registry_read_failed");
  });
});
