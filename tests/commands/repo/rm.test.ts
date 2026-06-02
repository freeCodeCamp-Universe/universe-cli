import { describe, expect, it, vi } from "vitest";
import { rm } from "../../../src/commands/repo/rm.js";

function repoRow(over: Record<string, unknown> = {}) {
  return {
    id: "req_001",
    name: "alpha",
    owner: "freeCodeCamp-Universe",
    visibility: "private",
    status: "failed",
    requestedBy: "alice",
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
    deleteRepoRequest: vi.fn().mockResolvedValue(undefined),
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

describe("repo rm command", () => {
  it("deletes in JSON mode without prompting", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((c: unknown) => {
        stdout.push(String(c));
        return true;
      });
    const deps = mkDeps();
    await rm({ json: true, id: "req_001" }, deps);
    writeSpy.mockRestore();

    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.deleteRepoRequest).toHaveBeenCalledWith({ id: "req_001" });
    expect(proxy.getRepoRequest).not.toHaveBeenCalled();
    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("repo rm");
    expect(env.success).toBe(true);
    expect(env.deleted).toBe(true);
    expect(env.id).toBe("req_001");
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("requires an id", async () => {
    const deps = mkDeps();
    await expect(rm({ json: false, id: "" }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
  });

  it("confirms in TTY, then deletes", async () => {
    const proxy = mkProxy();
    const prompts = {
      text: vi.fn(),
      select: vi.fn(),
      confirm: vi.fn().mockResolvedValue(true),
      isCancel: vi.fn().mockReturnValue(false),
    };
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
      isTTY: true,
      prompts,
    });
    await rm({ json: false, id: "req_001" }, deps);
    expect(proxy.getRepoRequest).toHaveBeenCalledWith("req_001");
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    expect(proxy.deleteRepoRequest).toHaveBeenCalledWith({ id: "req_001" });
    expect(deps.logSuccess).toHaveBeenCalledWith(
      expect.stringContaining("req_001"),
    );
    expect(deps.logSuccess).toHaveBeenCalledWith(
      expect.stringContaining("free"),
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
    await expect(rm({ json: false, id: "req_001" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(proxy.deleteRepoRequest).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(18);
  });

  it("requires --yes in a non-interactive (non-TTY) session", async () => {
    const proxy = mkProxy();
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(rm({ json: false, id: "req_001" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(proxy.deleteRepoRequest).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(10);
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
    await expect(rm({ json: false, id: "ghost" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(proxy.deleteRepoRequest).not.toHaveBeenCalled();
  });

  it("maps a delete proxy error and emits the JSON error envelope", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((c: unknown) => {
        stdout.push(String(c));
        return true;
      });
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = mkProxy();
    proxy.deleteRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(404, "not_found", "no such request"));
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(rm({ json: true, id: "ghost" }, deps)).rejects.toThrow(
      "__exit__",
    );
    writeSpy.mockRestore();
    expect(deps.exit).toHaveBeenCalledWith(10);
    const env = JSON.parse(stdout.join("").trim());
    expect(env.success).toBe(false);
    expect(env.error.kind).toBe("not_found");
    expect(env.error.message).toContain("not_found");
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("maps a 403 delete error to EXIT_CREDENTIALS", async () => {
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = mkProxy();
    proxy.deleteRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(403, "user_unauthorized", "forbidden"));
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(rm({ json: true, id: "req_001" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(12);
  });

  it("maps a 5xx delete error to EXIT_STORAGE", async () => {
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = mkProxy();
    proxy.deleteRepoRequest = vi
      .fn()
      .mockRejectedValue(
        new ProxyError(502, "repo_store_failed", "bad gateway"),
      );
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(rm({ json: true, id: "req_001" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(13);
  });
});
