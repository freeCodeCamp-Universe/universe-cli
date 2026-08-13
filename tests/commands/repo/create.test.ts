import { describe, expect, it, vi } from "vitest";
import { repoCreate, repoCreateHandler } from "../../../src/commands/repo/create.js";
import { ConfirmError } from "../../../src/errors.js";
import { ProxyError } from "../../../src/lib/proxy-client.js";
import type { Step, StepResponse } from "../../../src/interaction/step.js";
import type { CommandResult } from "../../../src/output/command-result.js";

function repoRow(over: Record<string, unknown> = {}) {
  return {
    id: "req_001",
    name: "my-repo",
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
    createRepoRequest: vi.fn().mockResolvedValue(repoRow()),
    listRepoRequests: vi.fn(),
    getRepoRequest: vi.fn(),
    approveRepoRequest: vi.fn(),
    rejectRepoRequest: vi.fn(),
    listRepoTemplates: vi.fn().mockResolvedValue([]),
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
  responses: Record<string, StepResponse> = {},
): Promise<{ steps: Step[]; result: CommandResult }> {
  const steps: Step[] = [];
  let next = await gen.next();
  while (!next.done) {
    const step = next.value;
    steps.push(step);
    const field = "field" in step ? step.field : undefined;
    const response = field && field in responses ? responses[field] : undefined;
    next = await gen.next(response);
  }
  return { steps, result: next.value };
}

describe("repoCreate SDK", () => {
  it("submits with all options pre-specified (yes mode)", async () => {
    const deps = mkDeps();
    const { result } = await drive(
      repoCreate({ name: "my-repo", visibility: "private", yes: true }, deps),
    );
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.createRepoRequest).toHaveBeenCalledWith({
      name: "my-repo",
      visibility: "private",
      description: undefined,
      template: undefined,
    });
    expect(result.data.command).toBe("repo create");
    expect(result.data.success).toBe(true);
    expect(result.data.status).toBe("pending");
  });

  it("omits empty-string template", async () => {
    const deps = mkDeps();
    await drive(repoCreate({ name: "my-repo", template: "", yes: true }, deps));
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.createRepoRequest).toHaveBeenCalledWith(
      expect.objectContaining({ template: undefined }),
    );
  });

  it("coerces a numeric option value to a string", async () => {
    const deps = mkDeps();
    await drive(
      repoCreate({ name: "my-repo", description: 2026 as unknown as string, yes: true }, deps),
    );
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.createRepoRequest).toHaveBeenCalledWith(
      expect.objectContaining({ description: "2026" }),
    );
  });

  it("throws UsageError when name is missing in yes mode", async () => {
    const deps = mkDeps();
    await expect(drive(repoCreate({ yes: true }, deps))).rejects.toThrow(/name is required/i);
  });

  it("rejects an invalid repo name", async () => {
    const deps = mkDeps();
    await expect(drive(repoCreate({ name: "-bad", yes: true }, deps))).rejects.toThrow();
  });

  it("yields text/select/confirm steps when yes is not set", async () => {
    const proxy = mkProxy();
    proxy.listRepoTemplates = vi.fn().mockResolvedValue(["hello-universe"]);
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    const { steps, result } = await drive(repoCreate({}, deps), {
      name: "my-repo",
      visibility: "public",
      description: "a desc",
      template: "hello-universe",
      submit: true,
    });
    expect(steps.some((s) => s.type === "text" && "field" in s && s.field === "name")).toBe(true);
    expect(steps.some((s) => s.type === "select" && "field" in s && s.field === "visibility")).toBe(true);
    expect(steps.some((s) => s.type === "confirm" && "field" in s && s.field === "submit")).toBe(true);
    expect(result.data.success).toBe(true);
  });

  it("throws ConfirmError when confirm is declined", async () => {
    const deps = mkDeps();
    await expect(
      drive(repoCreate({}, deps), {
        name: "my-repo",
        visibility: "private",
        description: "",
        template: undefined,
        submit: false,
      }),
    ).rejects.toThrow(ConfirmError);
  });

  it("falls back to free-text template when allowlist is empty", async () => {
    const proxy = mkProxy();
    proxy.listRepoTemplates = vi.fn().mockResolvedValue([]);
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    const { steps } = await drive(repoCreate({}, deps), {
      name: "my-repo",
      visibility: "private",
      description: "",
      template: "custom-template",
      submit: true,
    });
    // Template step should be a text field (free text fallback)
    const templateStep = steps.find((s) => "field" in s && s.field === "template");
    expect(templateStep?.type).toBe("text");
    const proxy2 = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy2.createRepoRequest).toHaveBeenCalledWith(
      expect.objectContaining({ template: "custom-template" }),
    );
  });

  it("shows select for template when templates are available", async () => {
    const proxy = mkProxy();
    proxy.listRepoTemplates = vi.fn().mockResolvedValue(["hello-universe"]);
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    const { steps } = await drive(repoCreate({}, deps), {
      name: "my-repo",
      visibility: "private",
      description: "",
      template: "hello-universe",
      submit: true,
    });
    const templateStep = steps.find((s) => "field" in s && s.field === "template");
    expect(templateStep?.type).toBe("select");
  });
});

describe("repoCreateHandler", () => {
  function mkHandlerDeps(overrides: Record<string, unknown> = {}) {
    return {
      ...mkDeps(),
      logSuccess: vi.fn(),
      logError: vi.fn(),
      exit: vi.fn().mockImplementation((_code: number) => {
        throw new Error("__exit__");
      }),
      ...overrides,
    };
  }

  it("submits in JSON mode without prompting", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      stdout.push(String(c));
      return true;
    });
    const deps = mkHandlerDeps();
    await repoCreateHandler({ json: true, name: "my-repo", visibility: "private" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("repo create");
    expect(env.success).toBe(true);
    expect(env.status).toBe("pending");
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("requires a name in non-interactive mode", async () => {
    const deps = mkHandlerDeps();
    await expect(repoCreateHandler({ json: false, yes: true }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
  });

  it("requires --yes in non-TTY session", async () => {
    const deps = mkHandlerDeps();
    await expect(
      repoCreateHandler({ json: false, name: "my-repo" }, deps),
    ).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
  });

  it("maps proxy 409 already_exists to EXIT_USAGE with hint in human mode", async () => {
    const proxy = mkProxy();
    proxy.createRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(409, "already_exists", "already pending"));
    const deps = mkHandlerDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(
      repoCreateHandler({ json: false, name: "dup", yes: true }, deps),
    ).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining("repo ls --status all"));
  });

  it("omits hint in JSON mode on already_exists", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
      stdout.push(String(c));
      return true;
    });
    const proxy = mkProxy();
    proxy.createRepoRequest = vi
      .fn()
      .mockRejectedValue(new ProxyError(409, "already_exists", "already pending"));
    const deps = mkHandlerDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(
      repoCreateHandler({ json: true, name: "dup" }, deps),
    ).rejects.toThrow("__exit__");
    writeSpy.mockRestore();
    const env = JSON.parse(stdout.join("").trim());
    expect(env.error.message).not.toContain("repo ls --status all");
    expect(env.error.kind).toBe("already_exists");
  });
});
