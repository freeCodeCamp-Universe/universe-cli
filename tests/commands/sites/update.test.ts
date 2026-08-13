import { describe, expect, it, vi } from "vitest";
import { sitesUpdate, sitesUpdateHandler } from "../../../src/commands/sites/update.js";
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
    updateSite: vi.fn().mockResolvedValue({
      slug: "blog",
      teams: ["news-editors", "platform"],
      createdAt: "2026-05-10T00:00:00Z",
      updatedAt: "2026-05-11T00:00:00Z",
      createdBy: "alice",
    }),
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

describe("sitesUpdate SDK", () => {
  it("calls updateSite with slug + parsed teams", async () => {
    const deps = mkDeps();
    await sitesUpdate({ slug: "blog", team: "news-editors,platform" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.updateSite).toHaveBeenCalledWith({
      slug: "blog",
      teams: ["news-editors", "platform"],
    });
  });

  it("returns CommandResult with envelope and format", async () => {
    const deps = mkDeps();
    const result = await sitesUpdate({ slug: "blog", team: "news-editors,platform" }, deps);
    expect(result.data.command).toBe("sites update");
    expect(result.data.success).toBe(true);
    expect(result.data.slug).toBe("blog");
    expect(result.data.teams).toEqual(["news-editors", "platform"]);
    expect(result.data.identitySource).toBe("env_GITHUB_TOKEN");
    expect(result.format).toContain("Updated blog");
  });

  it("throws UsageError on empty slug", async () => {
    const deps = mkDeps();
    await expect(sitesUpdate({ slug: "", team: "staff" }, deps)).rejects.toThrow(
      /slug is required/i,
    );
  });

  it("throws UsageError on missing --team", async () => {
    const deps = mkDeps();
    await expect(sitesUpdate({ slug: "blog" }, deps)).rejects.toThrow(/--team is required/i);
  });

  it("throws UsageError on empty --team string", async () => {
    const deps = mkDeps();
    await expect(sitesUpdate({ slug: "blog", team: "" }, deps)).rejects.toThrow(
      /--team is required/i,
    );
  });

  it("throws CredentialError when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(sitesUpdate({ slug: "blog", team: "staff" }, deps)).rejects.toThrow(
      CredentialError,
    );
  });

  it("throws proxy errors directly", async () => {
    const proxy = mkProxy();
    proxy.updateSite = vi
      .fn()
      .mockRejectedValue(new ProxyError(404, "not_found", "site is not registered"));
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(sitesUpdate({ slug: "ghost", team: "staff" }, deps)).rejects.toThrow(ProxyError);
  });
});

describe("sitesUpdateHandler", () => {
  it("emits success envelope in JSON mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    const deps = mkDeps();
    await sitesUpdateHandler({ json: true, slug: "blog", team: "news-editors,platform" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("sites update");
    expect(env.success).toBe(true);
    expect(env.slug).toBe("blog");
    expect(env.teams).toEqual(["news-editors", "platform"]);
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("calls logSuccess in text mode", async () => {
    const logSuccess = vi.fn();
    const deps = { ...mkDeps(), logSuccess, logError: vi.fn() };
    await sitesUpdateHandler(
      { json: false, slug: "blog", team: "news-editors,platform" },
      deps,
    );
    expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining("Updated blog"));
  });

  it("rejects empty slug with EXIT_USAGE", async () => {
    const exit = vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = { ...mkDeps(), logError, exit };
    await expect(
      sitesUpdateHandler({ json: false, slug: "", team: "staff" }, deps),
    ).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(10);
    expect(logError).toHaveBeenCalledWith(expect.stringMatching(/slug is required/i));
  });

  it("rejects missing --team with EXIT_USAGE (server enforces too)", async () => {
    const exit = vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = { ...mkDeps(), logError, exit };
    await expect(sitesUpdateHandler({ json: false, slug: "blog" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(exit).toHaveBeenCalledWith(10);
    expect(logError).toHaveBeenCalledWith(expect.stringMatching(/--team is required/i));
  });

  it("rejects empty --team string with EXIT_USAGE", async () => {
    const exit = vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = { ...mkDeps(), logError, exit };
    await expect(
      sitesUpdateHandler({ json: false, slug: "blog", team: "" }, deps),
    ).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(10);
    expect(logError).toHaveBeenCalledWith(expect.stringMatching(/--team is required/i));
  });

  it("maps proxy 404 not_found to surfaced code", async () => {
    const proxy = mkProxy();
    proxy.updateSite = vi
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
    await expect(
      sitesUpdateHandler({ json: false, slug: "ghost", team: "staff" }, deps),
    ).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(10);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("not_found"));
  });
});
