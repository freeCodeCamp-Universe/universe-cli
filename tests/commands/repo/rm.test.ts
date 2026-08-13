import { describe, expect, it, vi } from "vitest";
import { repoRm, repoRmHandler } from "../../../src/commands/repo/rm.js";
import { ConfirmError } from "../../../src/errors.js";
import { ProxyError } from "../../../src/lib/proxy-client.js";
import type { Step, StepResponse } from "../../../src/interaction/step.js";
import type { CommandResult } from "../../../src/output/command-result.js";

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
    resolveIdentity: vi.fn().mockResolvedValue({ token: "ghp_x", source: "env_GITHUB_TOKEN" }),
    createProxyClient: vi.fn().mockReturnValue(mkProxy()),
    ...overrides,
  };
}

async function drive(
  gen: AsyncGenerator<Step, CommandResult, StepResponse>,
  confirmResponse = true,
): Promise<CommandResult> {
  let next = await gen.next();
  while (!next.done) {
    const step = next.value;
    next = await gen.next(step.type === "confirm" ? confirmResponse : undefined);
  }
  return next.value;
}

describe("repoRm SDK", () => {
  it("deletes without confirm when yes is true", async () => {
    const deps = mkDeps();
    const result = await drive(repoRm({ id: "req_001", yes: true }, deps));
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.deleteRepoRequest).toHaveBeenCalledWith({ id: "req_001" });
    expect(proxy.getRepoRequest).not.toHaveBeenCalled();
    expect(result.data.command).toBe("repo rm");
    expect(result.data.deleted).toBe(true);
  });

  it("yields confirm step when yes is not set", async () => {
    const deps = mkDeps();
    const gen = repoRm({ id: "req_001" }, deps);
    const first = await gen.next();
    expect(first.done).toBe(false);
    expect((first.value as Step).type).toBe("confirm");
  });

  it("throws ConfirmError when confirm is declined", async () => {
    const deps = mkDeps();
    await expect(drive(repoRm({ id: "req_001" }, deps), false)).rejects.toThrow(ConfirmError);
  });

  it("confirms then deletes when confirm accepted", async () => {
    const deps = mkDeps();
    const result = await drive(repoRm({ id: "req_001" }, deps), true);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.getRepoRequest).toHaveBeenCalledWith("req_001");
    expect(proxy.deleteRepoRequest).toHaveBeenCalledWith({ id: "req_001" });
    expect(result.format).toContain("req_001");
    expect(result.format).toContain("free");
  });

  it("throws ProxyError on delete failure", async () => {
    const proxy = mkProxy();
    proxy.deleteRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(403, "user_unauthorized", "forbidden"));
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(drive(repoRm({ id: "req_001", yes: true }, deps))).rejects.toThrow(ProxyError);
  });
});

describe("repoRmHandler", () => {
  it("emits JSON envelope in json mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      stdout.push(String(c));
      return true;
    });
    const deps = mkDeps();
    await repoRmHandler({ json: true, id: "req_001" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("repo rm");
    expect(env.success).toBe(true);
    expect(env.deleted).toBe(true);
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("requires --yes in non-TTY session", async () => {
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const deps = { ...mkDeps(), logError: vi.fn(), exit };
    await expect(repoRmHandler({ json: false, id: "req_001" }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(10);
  });

  it("routes 403 through exit with EXIT_CREDENTIALS", async () => {
    const proxy = mkProxy();
    proxy.deleteRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(403, "user_unauthorized", "forbidden"));
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const deps = { ...mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) }), logError: vi.fn(), exit };
    await expect(repoRmHandler({ json: true, id: "req_001" }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(12);
  });

  it("routes 5xx through exit with EXIT_STORAGE", async () => {
    const proxy = mkProxy();
    proxy.deleteRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(502, "repo_store_failed", "bad gateway"));
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const deps = { ...mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) }), logError: vi.fn(), exit };
    await expect(repoRmHandler({ json: true, id: "req_001" }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(13);
  });

  it("emits JSON error envelope with identitySource on delete failure", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      stdout.push(String(c));
      return true;
    });
    const proxy = mkProxy();
    proxy.deleteRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(404, "not_found", "no such request"));
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const deps = { ...mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) }), logError: vi.fn(), exit };
    await expect(repoRmHandler({ json: true, id: "ghost" }, deps)).rejects.toThrow("__exit__");
    writeSpy.mockRestore();
    const env = JSON.parse(stdout.join("").trim());
    expect(env.success).toBe(false);
    expect(env.error.kind).toBe("not_found");
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });
});
