import { describe, expect, it, vi } from "vitest";
import { repoLs, repoLsHandler } from "../../../src/commands/repo/ls.js";
import { CredentialError, UsageError } from "../../../src/errors.js";
import { ProxyError } from "../../../src/lib/proxy-client.js";

function repoRow(over: Record<string, unknown> = {}) {
  return {
    id: "req_001",
    name: "alpha",
    owner: "freeCodeCamp-Universe",
    visibility: "private",
    status: "pending",
    requestedBy: "alice",
    createdAt: "2026-05-29T12:00:00Z",
    updatedAt: "2026-05-29T12:00:00Z",
    ...over,
  };
}

function mkProxy() {
  return {
    whoami: vi.fn(),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    deployFinalize: vi.fn(),
    siteDeploys: vi.fn(),
    getAlias: vi.fn(),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
    registerSite: vi.fn(),
    listSites: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
    createRepoRequest: vi.fn(),
    listRepoRequests: vi.fn().mockResolvedValue([repoRow()]),
    getRepoRequest: vi.fn(),
    approveRepoRequest: vi.fn(),
    rejectRepoRequest: vi.fn(),
    listRepoTemplates: vi.fn(),
  };
}

function mkDeps(overrides: Record<string, unknown> = {}) {
  return {
    env: {} as NodeJS.ProcessEnv,
    resolveIdentity: vi.fn().mockResolvedValue({ token: "ghp_x", source: "env_GITHUB_TOKEN" }),
    createProxyClient: vi.fn().mockReturnValue(mkProxy()),
    ...overrides,
  };
}

describe("repoLs SDK", () => {
  it("passes status + mine through to the client", async () => {
    const deps = mkDeps();
    await repoLs({ status: "active", mine: true }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.listRepoRequests).toHaveBeenCalledWith({
      status: "active",
      mine: true,
    });
  });

  it("returns CommandResult with envelope containing default status", async () => {
    const deps = mkDeps();
    const result = await repoLs({}, deps);
    expect(result.data.command).toBe("repo ls");
    expect(result.data.status).toBe("pending");
    expect(result.data.count).toBe(1);
    expect(result.data.requests).toHaveLength(1);
    expect(result.data.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("returns status-specific empty message when there are no rows", async () => {
    const proxy = mkProxy();
    proxy.listRepoRequests = vi.fn().mockResolvedValue([]);
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    const result = await repoLs({ status: "pending" }, deps);
    expect(result.format).toBe("No pending repo requests.");
  });

  it("renders a table for human output", async () => {
    const deps = mkDeps();
    const result = await repoLs({}, deps);
    expect(result.format).toContain("alpha");
  });

  it("throws UsageError for an unknown --status before any call", async () => {
    const deps = mkDeps();
    await expect(repoLs({ status: "actve" }, deps)).rejects.toThrow(UsageError);
    expect(deps.createProxyClient).not.toHaveBeenCalled();
  });

  it("accepts the 'all' pseudo-status", async () => {
    const deps = mkDeps();
    await repoLs({ status: "all" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.listRepoRequests).toHaveBeenCalledWith({
      status: "all",
      mine: false,
    });
  });

  it("maps --all to status 'all'", async () => {
    const deps = mkDeps();
    await repoLs({ all: true }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.listRepoRequests).toHaveBeenCalledWith({
      status: "all",
      mine: false,
    });
  });

  it("--all overrides an explicit --status", async () => {
    const deps = mkDeps();
    await repoLs({ status: "pending", all: true }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.listRepoRequests).toHaveBeenCalledWith({
      status: "all",
      mine: false,
    });
  });

  it("throws CredentialError when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(repoLs({}, deps)).rejects.toThrow(CredentialError);
  });

  it("throws proxy errors directly", async () => {
    const proxy = mkProxy();
    proxy.listRepoRequests = vi
      .fn()
      .mockRejectedValue(new ProxyError(403, "user_unauthorized", "denied"));
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(repoLs({}, deps)).rejects.toThrow(ProxyError);
  });
});

describe("repoLsHandler", () => {
  it("emits a JSON envelope with the effective default status", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      stdout.push(String(c));
      return true;
    });
    const deps = mkDeps();
    await repoLsHandler({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("repo ls");
    expect(env.status).toBe("pending");
    expect(env.count).toBe(1);
    expect(env.requests).toHaveLength(1);
  });

  it("prints a status-specific empty message when there are no rows", async () => {
    const proxy = mkProxy();
    proxy.listRepoRequests = vi.fn().mockResolvedValue([]);
    const logMessage = vi.fn();
    const deps = {
      ...mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) }),
      logMessage,
      logError: vi.fn(),
    };
    await repoLsHandler({ json: false, status: "pending" }, deps);
    expect(logMessage).toHaveBeenCalledWith("No pending repo requests.");
  });

  it("renders a table for human output", async () => {
    const logMessage = vi.fn();
    const deps = { ...mkDeps(), logMessage, logError: vi.fn() };
    await repoLsHandler({ json: false }, deps);
    expect(logMessage).toHaveBeenCalledWith(expect.stringContaining("alpha"));
  });

  it("rejects an unknown --status with a usage error before any call", async () => {
    const exit = vi.fn().mockImplementation((_c: number) => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = { ...mkDeps(), logError, exit };
    await expect(repoLsHandler({ json: false, status: "actve" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(exit).toHaveBeenCalledWith(10);
    expect(deps.createProxyClient).not.toHaveBeenCalled();
  });

  it("maps a proxy error to its exit code", async () => {
    const proxy = mkProxy();
    proxy.listRepoRequests = vi
      .fn()
      .mockRejectedValue(new ProxyError(403, "user_unauthorized", "denied"));
    const exit = vi.fn().mockImplementation((_c: number) => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = {
      ...mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) }),
      logError,
      exit,
    };
    await expect(repoLsHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(12); // EXIT_CREDENTIALS
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("user_unauthorized"));
  });
});
