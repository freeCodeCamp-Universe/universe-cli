import { describe, expect, it, vi } from "vitest";
import { ls } from "../../../src/commands/repo/ls.js";

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
    resolveIdentity: vi
      .fn()
      .mockResolvedValue({ token: "ghp_x", source: "env_GITHUB_TOKEN" }),
    createProxyClient: vi.fn().mockReturnValue(mkProxy()),
    logMessage: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_c: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

describe("repo ls command", () => {
  it("passes status + mine through to the client", async () => {
    const deps = mkDeps();
    await ls({ json: false, status: "active", mine: true }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.listRepoRequests).toHaveBeenCalledWith({
      status: "active",
      mine: true,
    });
  });

  it("emits a JSON envelope with the effective default status", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((c: unknown) => {
        stdout.push(String(c));
        return true;
      });
    const deps = mkDeps();
    await ls({ json: true }, deps);
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
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await ls({ json: false, status: "pending" }, deps);
    expect(deps.logMessage).toHaveBeenCalledWith("No pending repo requests.");
  });

  it("renders a table for human output", async () => {
    const deps = mkDeps();
    await ls({ json: false }, deps);
    expect(deps.logMessage).toHaveBeenCalledWith(
      expect.stringContaining("alpha"),
    );
  });

  it("rejects an unknown --status with a usage error before any call", async () => {
    const deps = mkDeps();
    await expect(ls({ json: false, status: "actve" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.createProxyClient).not.toHaveBeenCalled();
  });

  it("accepts the 'all' pseudo-status", async () => {
    const deps = mkDeps();
    await ls({ json: false, status: "all" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.listRepoRequests).toHaveBeenCalledWith({
      status: "all",
      mine: false,
    });
  });
});
