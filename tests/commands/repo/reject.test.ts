import { describe, expect, it, vi } from "vitest";
import { reject } from "../../../src/commands/repo/reject.js";

function repoRow(over: Record<string, unknown> = {}) {
  return {
    id: "req_001",
    name: "alpha",
    owner: "freeCodeCamp-Universe",
    visibility: "private",
    status: "rejected",
    rejectReason: "out of scope",
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
    getRepoRequest: vi.fn().mockResolvedValue(repoRow({ status: "pending" })),
    approveRepoRequest: vi.fn(),
    rejectRepoRequest: vi.fn().mockResolvedValue(repoRow()),
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
    logSuccess: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_c: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

describe("repo reject command", () => {
  it("passes id + reason to the client", async () => {
    const deps = mkDeps();
    await reject({ json: true, id: "req_001", reason: "out of scope" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.rejectRepoRequest).toHaveBeenCalledWith({
      id: "req_001",
      reason: "out of scope",
    });
  });

  it("requires an id", async () => {
    const deps = mkDeps();
    await expect(reject({ json: false, id: "" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(10);
  });

  it("aborts with EXIT_CONFIRM when the confirm is declined", async () => {
    const proxy = mkProxy();
    const prompts = {
      text: vi.fn(),
      select: vi.fn(),
      confirm: vi.fn().mockResolvedValue(false),
      isCancel: vi.fn().mockReturnValue(false),
    };
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
      isTTY: true,
      prompts,
    });
    await expect(reject({ json: false, id: "req_001" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(proxy.rejectRepoRequest).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(18);
  });

  it("requires --yes in a non-interactive (non-TTY) session", async () => {
    const proxy = mkProxy();
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(reject({ json: false, id: "req_001" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(proxy.rejectRepoRequest).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(10); // EXIT_USAGE
  });
});
