import { describe, expect, it, vi } from "vitest";
import { status } from "../../../src/commands/repo/status.js";

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

describe("repo status command", () => {
  it("requires an id", async () => {
    const deps = mkDeps();
    await expect(status({ json: false, id: "" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(10);
  });

  it("emits the row as a JSON envelope", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((c: unknown) => {
        stdout.push(String(c));
        return true;
      });
    const deps = mkDeps();
    await status({ json: true, id: "req_001" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("repo status");
    expect(env.request.id).toBe("req_001");
    expect(env.request.status).toBe("active");
  });

  it("renders a human key/value block", async () => {
    const deps = mkDeps();
    await status({ json: false, id: "req_001" }, deps);
    expect(deps.logMessage).toHaveBeenCalledWith(
      expect.stringContaining("Status:       active"),
    );
  });
});
