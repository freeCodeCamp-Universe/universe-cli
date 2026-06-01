import { describe, expect, it, vi } from "vitest";
import { approve } from "../../../src/commands/repo/approve.js";

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
    getRepoRequest: vi.fn().mockResolvedValue(repoRow({ status: "pending" })),
    approveRepoRequest: vi
      .fn()
      .mockResolvedValue({ outcome: "ok", request: repoRow() }),
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
    logSuccess: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_c: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

describe("repo approve command", () => {
  it("renders the ok outcome without prompting in JSON mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((c: unknown) => {
        stdout.push(String(c));
        return true;
      });
    const deps = mkDeps();
    await approve({ json: true, id: "req_001" }, deps);
    writeSpy.mockRestore();

    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.approveRepoRequest).toHaveBeenCalledWith({ id: "req_001" });
    expect(proxy.getRepoRequest).not.toHaveBeenCalled(); // no echo in non-interactive
    const env = JSON.parse(stdout.join("").trim());
    expect(env.success).toBe(true);
    expect(env.outcome).toBe("ok");
  });

  it("surfaces approved_failed with EXIT_STORAGE", async () => {
    const proxy = mkProxy();
    proxy.approveRepoRequest = vi.fn().mockResolvedValue({
      outcome: "approved_failed",
      request: repoRow({ status: "failed", error: "missing Contents:read" }),
    });
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(
      approve({ json: false, id: "req_001", yes: true }, deps),
    ).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(13); // EXIT_STORAGE
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringContaining("creation failed"),
    );
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
    await expect(approve({ json: false, id: "req_001" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(proxy.getRepoRequest).toHaveBeenCalledWith("req_001"); // echo
    expect(proxy.approveRepoRequest).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(18); // EXIT_CONFIRM
  });

  it("maps 409 already_resolved to EXIT_USAGE", async () => {
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = mkProxy();
    proxy.approveRepoRequest = vi
      .fn()
      .mockRejectedValue(
        new ProxyError(409, "already_resolved", "resolved by another admin"),
      );
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(
      approve({ json: false, id: "req_001", yes: true }, deps),
    ).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringContaining("already_resolved"),
    );
  });

  it("emits a structured failure envelope for approved_failed in JSON mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((c: unknown) => {
        stdout.push(String(c));
        return true;
      });
    const proxy = mkProxy();
    proxy.approveRepoRequest = vi.fn().mockResolvedValue({
      outcome: "approved_failed",
      request: repoRow({ status: "failed", error: "missing Contents:read" }),
    });
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(approve({ json: true, id: "req_001" }, deps)).rejects.toThrow(
      "__exit__",
    );
    writeSpy.mockRestore();
    expect(deps.exit).toHaveBeenCalledWith(13);
    const env = JSON.parse(stdout.join("").trim());
    expect(env.success).toBe(false);
    expect(env.outcome).toBe("approved_failed");
    expect(env.id).toBe("req_001");
    expect(env.repo).toBe("freeCodeCamp-Universe/alpha");
    expect(env.status).toBe("failed");
    expect(env.error.code).toBe(13);
    expect(env.error.message).toContain("repository creation failed");
    expect(env.creationError).toContain("missing Contents:read");
  });

  it("requires --yes in a non-interactive (non-TTY) session", async () => {
    const proxy = mkProxy();
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(approve({ json: false, id: "req_001" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(proxy.approveRepoRequest).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(10); // EXIT_USAGE
  });

  it("surfaces a getRepoRequest 404 before the confirm prompt", async () => {
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = mkProxy();
    proxy.getRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(404, "not_found", "no such request"));
    const prompts = {
      text: vi.fn(),
      select: vi.fn(),
      confirm: vi.fn(),
      isCancel: vi.fn().mockReturnValue(false),
    };
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
      isTTY: true,
      prompts,
    });
    await expect(approve({ json: false, id: "ghost" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(10); // EXIT_USAGE
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(proxy.approveRepoRequest).not.toHaveBeenCalled();
  });
});
