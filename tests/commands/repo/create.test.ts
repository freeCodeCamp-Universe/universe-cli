import { describe, expect, it, vi } from "vitest";
import { create } from "../../../src/commands/repo/create.js";

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

function mkPrompts(over: Record<string, unknown> = {}) {
  return {
    text: vi.fn().mockResolvedValue(""),
    select: vi.fn().mockResolvedValue(""),
    confirm: vi.fn().mockResolvedValue(true),
    isCancel: vi.fn().mockReturnValue(false),
    ...over,
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
    exit: vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

describe("repo create command", () => {
  it("submits in JSON mode without prompting", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((c: unknown) => {
        stdout.push(String(c));
        return true;
      });
    const deps = mkDeps();
    await create({ json: true, name: "my-repo", visibility: "private" }, deps);
    writeSpy.mockRestore();

    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.createRepoRequest).toHaveBeenCalledWith({
      name: "my-repo",
      visibility: "private",
      description: undefined,
      template: undefined,
    });
    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("repo create");
    expect(env.success).toBe(true);
    expect(env.status).toBe("pending");
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("omits empty-string template (V7)", async () => {
    const deps = mkDeps();
    await create({ json: true, name: "my-repo", template: "" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.createRepoRequest).toHaveBeenCalledWith(
      expect.objectContaining({ template: undefined }),
    );
  });

  it("requires a name in non-interactive mode", async () => {
    const deps = mkDeps();
    await expect(create({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringMatching(/name is required/i),
    );
  });

  it("rejects an invalid repo name with EXIT_USAGE", async () => {
    const deps = mkDeps();
    await expect(create({ json: true, name: "-bad" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(10);
  });

  it("rejects an invalid visibility with EXIT_USAGE", async () => {
    const deps = mkDeps();
    await expect(
      create({ json: true, name: "ok", visibility: "secret" }, deps),
    ).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
  });

  it("gathers fields via prompts and confirms in interactive mode", async () => {
    const proxy = mkProxy();
    proxy.listRepoTemplates = vi.fn().mockResolvedValue(["hello-universe"]);
    const prompts = mkPrompts({
      text: vi
        .fn()
        .mockResolvedValueOnce("my-repo") // name
        .mockResolvedValueOnce("a desc"), // description
      select: vi
        .fn()
        .mockResolvedValueOnce("public") // visibility
        .mockResolvedValueOnce("hello-universe"), // template
      confirm: vi.fn().mockResolvedValue(true),
      isCancel: vi.fn().mockReturnValue(false),
    });
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
      isTTY: true,
      prompts,
    });

    await create({ json: false }, deps);

    expect(proxy.createRepoRequest).toHaveBeenCalledWith({
      name: "my-repo",
      visibility: "public",
      description: "a desc",
      template: "hello-universe",
    });
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    expect(deps.logSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Request submitted"),
    );
  });

  it("falls back to free-text template when the allowlist is empty", async () => {
    const proxy = mkProxy();
    proxy.listRepoTemplates = vi.fn().mockResolvedValue([]); // fail-soft / empty
    const textMock = vi
      .fn()
      .mockResolvedValueOnce("my-repo") // name
      .mockResolvedValueOnce("") // description
      .mockResolvedValueOnce("custom-template"); // template (free text)
    const prompts = mkPrompts({
      text: textMock,
      select: vi.fn().mockResolvedValueOnce("private"), // visibility only
      confirm: vi.fn().mockResolvedValue(true),
    });
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
      isTTY: true,
      prompts,
    });

    await create({ json: false }, deps);
    expect(proxy.createRepoRequest).toHaveBeenCalledWith(
      expect.objectContaining({ template: "custom-template" }),
    );
  });

  it("aborts with EXIT_CONFIRM when the confirm is declined", async () => {
    const prompts = mkPrompts({
      text: vi.fn().mockResolvedValue("my-repo"),
      select: vi.fn().mockResolvedValue("private"),
      confirm: vi.fn().mockResolvedValue(false),
    });
    const deps = mkDeps({ isTTY: true, prompts });
    await expect(create({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(18); // EXIT_CONFIRM
  });

  it("aborts with EXIT_CONFIRM when a prompt is cancelled", async () => {
    const prompts = mkPrompts({
      text: vi.fn().mockResolvedValue(Symbol("cancel")),
      isCancel: vi.fn().mockReturnValue(true),
    });
    const deps = mkDeps({ isTTY: true, prompts });
    await expect(create({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(18);
  });

  it("maps proxy 409 already_exists to EXIT_USAGE", async () => {
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = mkProxy();
    proxy.createRepoRequest = vi
      .fn()
      .mockRejectedValue(
        new ProxyError(409, "already_exists", "already pending"),
      );
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(
      create({ json: false, name: "dup", yes: true }, deps),
    ).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringContaining("already_exists"),
    );
  });

  it("requires --yes in a non-interactive (non-TTY) session", async () => {
    const deps = mkDeps();
    await expect(
      create({ json: false, name: "my-repo" }, deps),
    ).rejects.toThrow("__exit__");
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.createRepoRequest).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(10); // EXIT_USAGE
  });
});
