import { describe, expect, it, vi } from "vitest";
import { repoApprove, repoApproveHandler } from "../../../src/commands/repo/approve.js";
import { ConfirmError, StorageError } from "../../../src/errors.js";
import { ProxyError } from "../../../src/lib/proxy-client.js";
import type { Step, StepResponse } from "../../../src/interaction/step.js";
import type { CommandResult } from "../../../src/output/command-result.js";

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
    approveRepoRequest: vi.fn().mockResolvedValue({ outcome: "ok", request: repoRow() }),
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

describe("repoApprove SDK", () => {
  it("yields confirm step when yes is not set", async () => {
    const deps = mkDeps();
    const gen = repoApprove({ id: "req_001" }, deps);
    const first = await gen.next();
    expect(first.done).toBe(false);
    expect((first.value as Step).type).toBe("confirm");
    expect((first.value as Step & { field: string }).field).toBe("approve");
  });

  it("skips confirm when yes is true", async () => {
    const deps = mkDeps();
    const result = await drive(repoApprove({ id: "req_001", yes: true }, deps));
    expect(result.data.command).toBe("repo approve");
    expect(result.data.success).toBe(true);
    expect(result.data.outcome).toBe("ok");
  });

  it("throws ConfirmError when confirm is declined", async () => {
    const deps = mkDeps();
    await expect(drive(repoApprove({ id: "req_001" }, deps), false)).rejects.toThrow(ConfirmError);
  });

  it("throws StorageError on approved_failed outcome", async () => {
    const proxy = mkProxy();
    proxy.approveRepoRequest = vi.fn().mockResolvedValue({
      outcome: "approved_failed",
      request: repoRow({ status: "failed", error: "missing Contents:read" }),
    });
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(drive(repoApprove({ id: "req_001", yes: true }, deps))).rejects.toThrow(
      StorageError,
    );
  });

  it("throws ProxyError on 409 already_resolved", async () => {
    const proxy = mkProxy();
    proxy.approveRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(409, "already_resolved", "resolved by another admin"));
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(drive(repoApprove({ id: "req_001", yes: true }, deps))).rejects.toThrow(
      ProxyError,
    );
  });

  it("returns CommandResult with envelope on success", async () => {
    const deps = mkDeps();
    const result = await drive(repoApprove({ id: "req_001", yes: true }, deps));
    expect(result.data.id).toBe("req_001");
    expect(result.data.outcome).toBe("ok");
    expect(result.data.repo).toBe("freeCodeCamp-Universe/alpha");
    expect(result.format).toContain("Approved alpha");
  });
});

describe("repoApproveHandler", () => {
  it("emits JSON envelope in json mode (skips confirm)", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      stdout.push(String(c));
      return true;
    });
    const deps = mkDeps();
    await repoApproveHandler({ json: true, id: "req_001" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.success).toBe(true);
    expect(env.outcome).toBe("ok");
  });

  it("routes approved_failed through exit with EXIT_STORAGE", async () => {
    const proxy = mkProxy();
    proxy.approveRepoRequest = vi.fn().mockResolvedValue({
      outcome: "approved_failed",
      request: repoRow({ status: "failed", error: "missing Contents:read" }),
    });
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const deps = { ...mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) }), logError: vi.fn(), exit };
    await expect(repoApproveHandler({ json: false, id: "req_001", yes: true }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(13);
  });

  it("requires --yes in non-TTY session", async () => {
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const deps = { ...mkDeps(), logError: vi.fn(), exit };
    await expect(repoApproveHandler({ json: false, id: "req_001" }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(10);
  });
});
