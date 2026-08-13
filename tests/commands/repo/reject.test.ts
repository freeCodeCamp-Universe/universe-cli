import { describe, expect, it, vi } from "vitest";
import { repoReject, repoRejectHandler } from "../../../src/commands/repo/reject.js";
import { ConfirmError } from "../../../src/errors.js";
import type { Step, StepResponse } from "../../../src/interaction/step.js";
import type { CommandResult } from "../../../src/output/command-result.js";

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

describe("repoReject SDK", () => {
  it("passes id + reason to the client", async () => {
    const deps = mkDeps();
    const result = await drive(repoReject({ id: "req_001", reason: "out of scope", yes: true }, deps));
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.rejectRepoRequest).toHaveBeenCalledWith({
      id: "req_001",
      reason: "out of scope",
    });
    expect(result.data.command).toBe("repo reject");
    expect(result.data.success).toBe(true);
  });

  it("stringifies a numeric --reason", async () => {
    const deps = mkDeps();
    await drive(repoReject({ id: "req_001", reason: 42 as unknown as string, yes: true }, deps));
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.rejectRepoRequest).toHaveBeenCalledWith({
      id: "req_001",
      reason: "42",
    });
  });

  it("throws ConfirmError when confirm is declined", async () => {
    const deps = mkDeps();
    await expect(drive(repoReject({ id: "req_001" }, deps), false)).rejects.toThrow(ConfirmError);
  });

  it("yields confirm step when yes is not set", async () => {
    const deps = mkDeps();
    const gen = repoReject({ id: "req_001" }, deps);
    const first = await gen.next();
    expect(first.done).toBe(false);
    expect((first.value as Step).type).toBe("confirm");
  });
});

describe("repoRejectHandler", () => {
  it("emits JSON envelope in json mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      stdout.push(String(c));
      return true;
    });
    const deps = mkDeps();
    await repoRejectHandler({ json: true, id: "req_001", reason: "out of scope" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.success).toBe(true);
    expect(env.rejectReason).toBe("out of scope");
  });

  it("requires --yes in non-TTY session", async () => {
    const exit = vi.fn().mockImplementation(() => {
      throw new Error("__exit__");
    });
    const deps = { ...mkDeps(), logError: vi.fn(), exit };
    await expect(repoRejectHandler({ json: false, id: "req_001" }, deps)).rejects.toThrow("__exit__");
    expect(exit).toHaveBeenCalledWith(10);
  });
});
