import { describe, expect, it, vi } from "vitest";
import { deploy } from "../../src/commands/deploy.js";
import { ProxyError } from "../../src/lib/proxy-client.js";

interface FakeDeps {
  cwd: string;
  env: NodeJS.ProcessEnv;
  readPlatformYaml: ReturnType<typeof vi.fn>;
  resolveIdentity: ReturnType<typeof vi.fn>;
  createProxyClient: ReturnType<typeof vi.fn>;
  getGitState: ReturnType<typeof vi.fn>;
  runBuild: ReturnType<typeof vi.fn>;
  walkFiles: ReturnType<typeof vi.fn>;
  uploadFiles: ReturnType<typeof vi.fn>;
  logSuccess: ReturnType<typeof vi.fn>;
  logInfo: ReturnType<typeof vi.fn>;
  logWarn: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
}

const VALID_YAML = `site: my-site
build:
  command: bun run build
  output: dist
deploy:
  preview: true
  ignore:
    - "*.map"
`;

function mkProxy(): {
  whoami: ReturnType<typeof vi.fn>;
  deployInit: ReturnType<typeof vi.fn>;
  deployUpload: ReturnType<typeof vi.fn>;
  deployFinalize: ReturnType<typeof vi.fn>;
  siteDeploys: ReturnType<typeof vi.fn>;
  sitePromote: ReturnType<typeof vi.fn>;
  siteRollback: ReturnType<typeof vi.fn>;
} {
  return {
    whoami: vi.fn().mockResolvedValue({
      login: "raisedadead",
      authorizedSites: ["my-site"],
    }),
    deployInit: vi.fn().mockResolvedValue({
      deployId: "20260427-abc1234",
      jwt: "jwt_xxx",
      expiresAt: "2026-04-27T01:00:00Z",
    }),
    deployUpload: vi.fn(),
    deployFinalize: vi.fn().mockResolvedValue({
      url: "https://my-site.preview.freecode.camp",
      deployId: "20260427-abc1234",
      mode: "preview",
    }),
    siteDeploys: vi.fn(),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
  };
}

function mkDeps(overrides: Partial<FakeDeps> = {}): FakeDeps {
  const proxy = mkProxy();
  return {
    cwd: "/proj",
    env: {},
    readPlatformYaml: vi.fn().mockResolvedValue(VALID_YAML),
    resolveIdentity: vi.fn().mockResolvedValue({
      token: "ghp_x",
      source: "env_GITHUB_TOKEN",
    }),
    createProxyClient: vi.fn().mockReturnValue(proxy),
    getGitState: vi.fn().mockReturnValue({
      hash: "abc1234567",
      dirty: false,
    }),
    runBuild: vi.fn().mockResolvedValue({
      skipped: false,
      outputDir: "/proj/dist",
    }),
    walkFiles: vi.fn().mockReturnValue([
      { relPath: "index.html", absPath: "/proj/dist/index.html" },
      { relPath: "main.js", absPath: "/proj/dist/main.js" },
    ]),
    uploadFiles: vi.fn().mockResolvedValue({
      fileCount: 2,
      totalSize: 2048,
      uploaded: ["index.html", "main.js"],
      errors: [],
    }),
    logSuccess: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

describe("deploy command (proxy plane)", () => {
  describe("happy path", () => {
    it("walks identity → init → build → upload → finalize", async () => {
      const deps = mkDeps();
      await deploy({ json: false }, deps);

      expect(deps.resolveIdentity).toHaveBeenCalledTimes(1);
      expect(deps.runBuild).toHaveBeenCalledTimes(1);
      expect(deps.walkFiles).toHaveBeenCalledWith("/proj/dist");
      const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
        typeof mkProxy
      >;
      expect(proxy.deployInit).toHaveBeenCalledWith(
        expect.objectContaining({
          site: "my-site",
          sha: "abc1234567",
          files: ["index.html", "main.js"],
        }),
      );
      expect(deps.uploadFiles).toHaveBeenCalled();
      expect(proxy.deployFinalize).toHaveBeenCalledWith(
        expect.objectContaining({
          deployId: "20260427-abc1234",
          jwt: "jwt_xxx",
          mode: "preview",
        }),
      );
    });

    it("emits success envelope in JSON mode", async () => {
      const stdout: string[] = [];
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: unknown) => {
          stdout.push(String(chunk));
          return true;
        });

      const deps = mkDeps();
      await deploy({ json: true }, deps);
      writeSpy.mockRestore();

      const env = JSON.parse(stdout.join("").trim());
      expect(env.command).toBe("deploy");
      expect(env.success).toBe(true);
      expect(env.deployId).toBe("20260427-abc1234");
      expect(env.url).toBe("https://my-site.preview.freecode.camp");
      expect(env.mode).toBe("preview");
      expect(env.fileCount).toBe(2);
    });

    it("prints summary in text mode (deploy id + preview url)", async () => {
      const deps = mkDeps();
      await deploy({ json: false }, deps);
      const msg = deps.logSuccess.mock.calls[0]?.[0] ?? "";
      expect(msg).toContain("20260427-abc1234");
      expect(msg).toContain("https://my-site.preview.freecode.camp");
    });
  });

  describe("--promote flag", () => {
    it("forwards mode=production to finalize", async () => {
      const deps = mkDeps();
      await deploy({ json: false, promote: true }, deps);
      const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
        typeof mkProxy
      >;
      const finalizeArg = proxy.deployFinalize.mock.calls[0]?.[0] as {
        mode: string;
      };
      expect(finalizeArg.mode).toBe("production");
    });
  });

  describe("--dir flag", () => {
    it("overrides build output directory", async () => {
      const deps = mkDeps({
        runBuild: vi.fn().mockResolvedValue({
          skipped: false,
          outputDir: "/proj/build-out",
        }),
      });
      await deploy({ json: false, dir: "build-out" }, deps);
      const arg = deps.runBuild.mock.calls[0]?.[0] as { outputDir: string };
      expect(arg.outputDir).toBe("build-out");
      expect(deps.walkFiles).toHaveBeenCalledWith("/proj/build-out");
    });
  });

  describe("identity / config errors", () => {
    it("errors with EXIT_CREDENTIALS when identity chain returns null", async () => {
      const deps = mkDeps({
        resolveIdentity: vi.fn().mockResolvedValue(null),
      });
      await expect(deploy({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.runBuild).not.toHaveBeenCalled();
      expect(deps.exit).toHaveBeenCalledWith(
        12,
        expect.stringMatching(/login|identity/i),
      );
    });

    it("errors with EXIT_CONFIG when platform.yaml is missing", async () => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      const deps = mkDeps({
        readPlatformYaml: vi.fn().mockRejectedValue(err),
      });
      await expect(deploy({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(
        11,
        expect.stringMatching(/platform\.yaml/i),
      );
    });

    it("errors with EXIT_CONFIG on v1 platform.yaml fragment", async () => {
      const v1 = "name: my-site\nr2:\n  bucket: x\n";
      const deps = mkDeps({
        readPlatformYaml: vi.fn().mockResolvedValue(v1),
      });
      await expect(deploy({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(
        11,
        expect.stringMatching(/v1|migration/i),
      );
    });

    it("errors with EXIT_CONFIG on invalid site name", async () => {
      const bad = "site: BAD-Name\n";
      const deps = mkDeps({
        readPlatformYaml: vi.fn().mockResolvedValue(bad),
      });
      await expect(deploy({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(11, expect.any(String));
    });
  });

  describe("preflight authorization (whoami)", () => {
    it("calls whoami before runBuild and short-circuits when site not authorized", async () => {
      const proxy = mkProxy();
      proxy.whoami.mockResolvedValue({
        login: "freeCodeCamp-bot",
        authorizedSites: ["other-site"],
      });
      const deps = mkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await expect(deploy({ json: false }, deps)).rejects.toThrow("__exit__");
      // whoami called BEFORE the slow build step.
      expect(proxy.whoami).toHaveBeenCalledTimes(1);
      expect(deps.runBuild).not.toHaveBeenCalled();
      expect(proxy.deployInit).not.toHaveBeenCalled();
      // Exit credentials with helpful body: login, authorized list, runbook URL.
      expect(deps.exit).toHaveBeenCalledWith(
        12,
        expect.stringContaining("my-site"),
      );
      const exitMsg = deps.exit.mock.calls[0]?.[1] as string;
      expect(exitMsg).toContain("freeCodeCamp-bot");
      expect(exitMsg).toContain("other-site");
      expect(exitMsg).toContain(
        "freeCodeCamp/infra/blob/main/docs/runbooks/01-deploy-new-constellation-site.md",
      );
    });

    it("proceeds when site IS in authorizedSites (default happy fixture)", async () => {
      const deps = mkDeps();
      await deploy({ json: false }, deps);
      const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
        typeof mkProxy
      >;
      expect(proxy.whoami).toHaveBeenCalledTimes(1);
      expect(deps.runBuild).toHaveBeenCalledTimes(1);
      expect(proxy.deployInit).toHaveBeenCalledTimes(1);
    });
  });

  describe("git state", () => {
    it("warns but proceeds when working tree is dirty", async () => {
      const deps = mkDeps({
        getGitState: vi.fn().mockReturnValue({ hash: "abcdef0", dirty: true }),
      });
      await deploy({ json: false }, deps);
      expect(deps.logWarn).toHaveBeenCalled();
      const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
        typeof mkProxy
      >;
      expect(proxy.deployInit).toHaveBeenCalled();
    });

    it("falls back to a synthetic sha when no git state", async () => {
      const deps = mkDeps({
        getGitState: vi
          .fn()
          .mockReturnValue({ hash: null, dirty: false, error: "no git" }),
      });
      await deploy({ json: false }, deps);
      const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
        typeof mkProxy
      >;
      const initArg = proxy.deployInit.mock.calls[0]?.[0] as { sha: string };
      expect(initArg.sha).toMatch(/^nogit-/);
    });
  });

  describe("ignore filter", () => {
    it("excludes files matching deploy.ignore patterns", async () => {
      const deps = mkDeps({
        walkFiles: vi.fn().mockReturnValue([
          { relPath: "index.html", absPath: "/p/index.html" },
          { relPath: "main.js.map", absPath: "/p/main.js.map" },
          { relPath: "main.js", absPath: "/p/main.js" },
        ]),
      });
      await deploy({ json: false }, deps);
      const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
        typeof mkProxy
      >;
      const initArg = proxy.deployInit.mock.calls[0]?.[0] as {
        files: string[];
      };
      expect(initArg.files).toEqual(["index.html", "main.js"]);
      const uploadArg = deps.uploadFiles.mock.calls[0]?.[0] as {
        files: { relPath: string }[];
      };
      expect(uploadArg.files.map((f) => f.relPath)).toEqual([
        "index.html",
        "main.js",
      ]);
    });
  });

  describe("upload errors", () => {
    it("aborts with EXIT_PARTIAL when uploadFiles surfaces errors", async () => {
      const deps = mkDeps({
        uploadFiles: vi.fn().mockResolvedValue({
          fileCount: 1,
          totalSize: 100,
          uploaded: ["a.html"],
          errors: ["b.html: 503"],
        }),
      });
      await expect(deploy({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(
        19,
        expect.stringMatching(/partial|failed/i),
      );
      const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
        typeof mkProxy
      >;
      expect(proxy.deployFinalize).not.toHaveBeenCalled();
    });
  });

  describe("proxy errors", () => {
    it("propagates ProxyError from deployInit", async () => {
      const proxy = mkProxy();
      proxy.deployInit.mockRejectedValue(
        new ProxyError(403, "site_unauthorized", "no team"),
      );
      const deps = mkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await expect(deploy({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(
        12,
        expect.stringContaining("no team"),
      );
    });

    it("propagates ProxyError from deployFinalize", async () => {
      const proxy = mkProxy();
      proxy.deployFinalize.mockRejectedValue(
        new ProxyError(422, "verify_failed", "missing"),
      );
      const deps = mkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await expect(deploy({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(
        13,
        expect.stringContaining("missing"),
      );
    });
  });

  describe("baseUrl resolution", () => {
    it("uses default https://uploads.freecode.camp", async () => {
      const deps = mkDeps();
      await deploy({ json: false }, deps);
      const cfg = deps.createProxyClient.mock.calls[0]?.[0] as {
        baseUrl: string;
      };
      expect(cfg.baseUrl).toBe("https://uploads.freecode.camp");
    });

    it("respects $UNIVERSE_PROXY_URL env override", async () => {
      const deps = mkDeps({
        env: { UNIVERSE_PROXY_URL: "https://staging.example" },
      });
      await deploy({ json: false }, deps);
      const cfg = deps.createProxyClient.mock.calls[0]?.[0] as {
        baseUrl: string;
      };
      expect(cfg.baseUrl).toBe("https://staging.example");
    });
  });
});
