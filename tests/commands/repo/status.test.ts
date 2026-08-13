import { describe, expect, it, vi } from "vitest";
import { repoStatus, repoStatusHandler } from "../../../src/commands/repo/status.js";
import { CredentialError, UsageError } from "../../../src/errors.js";
import { ProxyError } from "../../../src/lib/proxy-client.js";

function repoRow(over: Record<string, unknown> = {}) {
  return {
    id: "req_001",
    name: "alpha",
    owner: "freeCodeCamp-Universe",
    visibility: "private",
    status: "active",
    url: "https://github.com/freeCodeCamp-Universe/alpha",
    requestedBy: "alice",
    approver: "boss",
    createdAt: "2026-05-29T12:00:00Z",
    updatedAt: "2026-05-29T12:01:00Z",
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
    listRepoRequests: vi.fn(),
    getRepoRequest: vi.fn().mockResolvedValue(repoRow()),
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

describe("repoStatus SDK", () => {
  it("returns CommandResult with envelope and format", async () => {
    const deps = mkDeps();
    const result = await repoStatus({ id: "req_001" }, deps);
    expect(result.data.command).toBe("repo status");
    expect(result.data.success).toBe(true);
    const request = result.data.request as { id: string; status: string };
    expect(request.id).toBe("req_001");
    expect(request.status).toBe("active");
    expect(result.data.identitySource).toBe("env_GITHUB_TOKEN");
    expect(result.format).toContain("Status:       active");
  });

  it("throws UsageError on empty id", async () => {
    const deps = mkDeps();
    await expect(repoStatus({ id: "" }, deps)).rejects.toThrow(UsageError);
  });

  it("throws CredentialError when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(repoStatus({ id: "req_001" }, deps)).rejects.toThrow(CredentialError);
  });

  it("throws proxy errors directly", async () => {
    const proxy = mkProxy();
    proxy.getRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(403, "user_unauthorized", "denied"));
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(repoStatus({ id: "req_001" }, deps)).rejects.toThrow(ProxyError);
  });
});

describe("repoStatusHandler", () => {
  it("requires an id", async () => {
    const exit = vi.fn().mockImplementation((_c: number) => {
      throw new Error("__exit__");
    });
    const logError = vi.fn();
    const deps = { ...mkDeps(), logError, exit };
    await expect(repoStatusHandler({ json: false, id: "" }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(10);
  });

  it("emits the row as a JSON envelope", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      stdout.push(String(c));
      return true;
    });
    const deps = mkDeps();
    await repoStatusHandler({ json: true, id: "req_001" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("repo status");
    expect(env.request.id).toBe("req_001");
    expect(env.request.status).toBe("active");
  });

  it("includes identitySource and error.kind in the JSON error envelope", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      stdout.push(String(c));
      return true;
    });
    const proxy = mkProxy();
    proxy.getRepoRequest = vi
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
    await expect(repoStatusHandler({ json: true, id: "req_001" }, deps)).rejects.toThrow(
      "__exit__",
    );
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.success).toBe(false);
    expect(env.error.kind).toBe("user_unauthorized");
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("renders a human key/value block", async () => {
    const logMessage = vi.fn();
    const deps = { ...mkDeps(), logMessage, logError: vi.fn() };
    await repoStatusHandler({ json: false, id: "req_001" }, deps);
    expect(logMessage).toHaveBeenCalledWith(expect.stringContaining("Status:       active"));
  });
});
