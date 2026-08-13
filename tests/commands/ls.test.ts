import { describe, expect, it, vi } from "vitest";
import { staticLs, staticLsHandler } from "../../src/commands/ls.js";

const VALID_YAML = "site: my-site\n";

function mkProxy(): {
  whoami: ReturnType<typeof vi.fn>;
  deployInit: ReturnType<typeof vi.fn>;
  deployUpload: ReturnType<typeof vi.fn>;
  deployFinalize: ReturnType<typeof vi.fn>;
  siteDeploys: ReturnType<typeof vi.fn>;
  sitePromote: ReturnType<typeof vi.fn>;
  siteRollback: ReturnType<typeof vi.fn>;
  getAlias: ReturnType<typeof vi.fn>;
} {
  return {
    whoami: vi.fn(),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    deployFinalize: vi.fn(),
    siteDeploys: vi
      .fn()
      .mockResolvedValue([
        { deployId: "20260427-141522-abc1234" },
        { deployId: "20260426-101005-def5678" },
      ]),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
    getAlias: vi.fn().mockResolvedValue(null),
  };
}

interface FakeSdkDeps {
  cwd: string;
  env: NodeJS.ProcessEnv;
  readPlatformYaml: ReturnType<typeof vi.fn>;
  resolveIdentity: ReturnType<typeof vi.fn>;
  createProxyClient: ReturnType<typeof vi.fn>;
}

function mkSdkDeps(overrides: Partial<FakeSdkDeps> = {}): FakeSdkDeps {
  return {
    cwd: "/proj",
    env: {},
    readPlatformYaml: vi.fn().mockResolvedValue(VALID_YAML),
    resolveIdentity: vi.fn().mockResolvedValue({
      token: "ghp_x",
      source: "env_GITHUB_TOKEN",
    }),
    createProxyClient: vi.fn().mockReturnValue(mkProxy()),
    ...overrides,
  };
}

interface FakeHandlerDeps extends FakeSdkDeps {
  logSuccess: ReturnType<typeof vi.fn>;
  logInfo: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
}

function mkHandlerDeps(overrides: Partial<FakeHandlerDeps> = {}): FakeHandlerDeps {
  return {
    ...mkSdkDeps(overrides),
    logSuccess: vi.fn(),
    logInfo: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

describe("staticLs SDK function", () => {
  it("calls siteDeploys with site from platform.yaml", async () => {
    const deps = mkSdkDeps();
    await staticLs({}, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<typeof mkProxy>;
    expect(proxy.siteDeploys).toHaveBeenCalledWith({ site: "my-site" });
  });

  it("--site option overrides platform.yaml site", async () => {
    const deps = mkSdkDeps();
    await staticLs({ site: "other-site" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<typeof mkProxy>;
    expect(proxy.siteDeploys).toHaveBeenCalledWith({ site: "other-site" });
  });

  it("works without platform.yaml when site provided", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    const deps = mkSdkDeps({
      readPlatformYaml: vi.fn().mockRejectedValue(err),
    });
    await staticLs({ site: "explicit-site" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<typeof mkProxy>;
    expect(proxy.siteDeploys).toHaveBeenCalledWith({ site: "explicit-site" });
  });

  it("returns CommandResult with deploys and aliases", async () => {
    const deps = mkSdkDeps();
    const result = await staticLs({}, deps);
    expect(result.data.command).toBe("ls");
    expect(result.data.success).toBe(true);
    expect(result.data["site"]).toBe("my-site");
    const deploys = result.data["deploys"] as Array<Record<string, unknown>>;
    expect(deploys).toEqual([
      {
        deployId: "20260427-141522-abc1234",
        timestamp: "2026-04-27T14:15:22Z",
        sha: "abc1234",
        state: null,
      },
      {
        deployId: "20260426-101005-def5678",
        timestamp: "2026-04-26T10:10:05Z",
        sha: "def5678",
        state: null,
      },
    ]);
    expect(result.data["aliases"]).toEqual({ preview: null, production: null });
  });

  it("annotates STATE from preview/production aliases", async () => {
    const proxy = mkProxy();
    proxy.getAlias.mockImplementation(async (req: { mode: "preview" | "production" }) =>
      req.mode === "preview"
        ? {
            url: "https://my-site.preview.freecode.camp",
            deployId: "20260427-141522-abc1234",
          }
        : {
            url: "https://my-site.freecode.camp",
            deployId: "20260426-101005-def5678",
          },
    );
    const deps = mkSdkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });

    const result = await staticLs({}, deps);
    const deploys = result.data["deploys"] as Array<Record<string, unknown>>;
    expect(deploys[0].state).toBe("preview");
    expect(deploys[1].state).toBe("production");
    expect(result.data["aliases"]).toEqual({
      preview: "20260427-141522-abc1234",
      production: "20260426-101005-def5678",
    });
  });

  it("marks a deploy that is both preview and production", async () => {
    const proxy = mkProxy();
    proxy.getAlias.mockResolvedValue({
      url: "https://my-site.freecode.camp",
      deployId: "20260427-141522-abc1234",
    });
    const deps = mkSdkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });

    const result = await staticLs({}, deps);
    const deploys = result.data["deploys"] as Array<Record<string, unknown>>;
    expect(deploys[0].state).toBe("preview+production");
  });

  it("includes table header + rows in format string", async () => {
    const deps = mkSdkDeps();
    const result = await staticLs({}, deps);
    expect(result.format).toContain("DEPLOY ID");
    expect(result.format).toContain("TIMESTAMP");
    expect(result.format).toContain("SHA");
    expect(result.format).toContain("STATE");
    expect(result.format).toContain("20260427-141522-abc1234");
    expect(result.format).toContain("abc1234");
  });

  it("renders the STATE column value in format string", async () => {
    const proxy = mkProxy();
    proxy.getAlias.mockImplementation(async (req: { mode: "preview" | "production" }) =>
      req.mode === "preview"
        ? {
            url: "https://my-site.preview.freecode.camp",
            deployId: "20260427-141522-abc1234",
          }
        : null,
    );
    const deps = mkSdkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    const result = await staticLs({}, deps);
    expect(result.format).toContain("preview");
  });

  it("shows the finalizing actor in the ACTOR column", async () => {
    const proxy = mkProxy();
    proxy.siteDeploys.mockResolvedValue([{ deployId: "20260427-141522-abc1234", actor: "alice" }]);
    const deps = mkSdkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    const result = await staticLs({}, deps);
    expect(result.format).toContain("ACTOR");
    expect(result.format).toContain("alice");
  });

  it("reports empty list cleanly in format string", async () => {
    const proxy = mkProxy();
    proxy.siteDeploys.mockResolvedValue([]);
    const deps = mkSdkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    const result = await staticLs({}, deps);
    expect(result.format.toLowerCase()).toContain("no deploys");
  });

  it("throws CredentialError when identity null", async () => {
    const deps = mkSdkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(staticLs({}, deps)).rejects.toThrow(/login|identity/i);
  });

  it("throws ConfigError when no platform.yaml AND no site option", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    const deps = mkSdkDeps({
      readPlatformYaml: vi.fn().mockRejectedValue(err),
    });
    await expect(staticLs({}, deps)).rejects.toThrow(/site|platform\.yaml/i);
  });

  it("sorts deploys newest-first regardless of artemis-side order", async () => {
    const proxy = mkProxy();
    proxy.siteDeploys.mockResolvedValue([
      { deployId: "20260101-000000-aaa1111" },
      { deployId: "20260301-091500-bbb2222" },
      { deployId: "20260215-120000-ccc3333" },
    ]);
    const deps = mkSdkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });

    const result = await staticLs({}, deps);
    const deploys = result.data["deploys"] as Array<{ deployId: string }>;
    expect(deploys.map((d) => d.deployId)).toEqual([
      "20260301-091500-bbb2222",
      "20260215-120000-ccc3333",
      "20260101-000000-aaa1111",
    ]);
  });

  it("parses nogit-* deploy ids (server-issued when sha unavailable)", async () => {
    const proxy = mkProxy();
    proxy.siteDeploys.mockResolvedValue([
      { deployId: "20260513-120000-nogit-7" },
      { deployId: "20260512-090000-abc1234" },
    ]);
    const deps = mkSdkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });

    const result = await staticLs({}, deps);
    const deploys = result.data["deploys"] as Array<Record<string, unknown>>;
    expect(deploys).toEqual([
      {
        deployId: "20260513-120000-nogit-7",
        timestamp: "2026-05-13T12:00:00Z",
        sha: "nogit-7",
        state: null,
      },
      {
        deployId: "20260512-090000-abc1234",
        timestamp: "2026-05-12T09:00:00Z",
        sha: "abc1234",
        state: null,
      },
    ]);
  });

  it("falls back to deployId-only row when format unparseable", async () => {
    const proxy = mkProxy();
    proxy.siteDeploys.mockResolvedValue([{ deployId: "weird-id" }]);
    const deps = mkSdkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });

    const result = await staticLs({}, deps);
    const deploys = result.data["deploys"] as Array<Record<string, unknown>>;
    expect(deploys[0]).toEqual({
      deployId: "weird-id",
      timestamp: null,
      sha: null,
      state: null,
    });
  });
});

describe("staticLsHandler CLI wrapper", () => {
  it("emits JSON envelope via stdout", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    const deps = mkHandlerDeps();
    await staticLsHandler({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("ls");
    expect(env.success).toBe(true);
    expect(env.site).toBe("my-site");
    expect(env.deploys).toHaveLength(2);
  });

  it("prints table via logSuccess in text mode", async () => {
    const deps = mkHandlerDeps();
    await staticLsHandler({ json: false }, deps);
    const msg = deps.logSuccess.mock.calls[0]?.[0] ?? "";
    expect(msg).toContain("DEPLOY ID");
    expect(msg).toContain("20260427-141522-abc1234");
  });

  it("prints empty-list message via logInfo in text mode", async () => {
    const proxy = mkProxy();
    proxy.siteDeploys.mockResolvedValue([]);
    const deps = mkHandlerDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await staticLsHandler({ json: false }, deps);
    const all = [
      ...deps.logInfo.mock.calls.map((c) => c[0]),
      ...deps.logSuccess.mock.calls.map((c) => c[0]),
    ].join("\n");
    expect(all.toLowerCase()).toContain("no deploys");
  });

  it("errors with EXIT_CREDENTIALS when identity null", async () => {
    const deps = mkHandlerDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(staticLsHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(12);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/login|identity/i));
  });

  it("errors with EXIT_CONFIG when no platform.yaml AND no --site", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    const deps = mkHandlerDeps({
      readPlatformYaml: vi.fn().mockRejectedValue(err),
    });
    await expect(staticLsHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(11);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/site|platform\.yaml/i));
  });
});
