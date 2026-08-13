import { describe, expect, it, vi } from "vitest";
import { staticDeploy, staticDeployHandler } from "../../src/commands/deploy.js";
import type { StaticDeploySdkDeps, StaticDeployHandlerDeps } from "../../src/commands/deploy.js";
import { ProxyError } from "../../src/lib/proxy-client.js";
import type { Step, StepResponse } from "../../src/interaction/step.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function driveToEnd<T>(
  gen: AsyncGenerator<Step, T, StepResponse>,
): Promise<{ steps: Step[]; result: T }> {
  const steps: Step[] = [];
  let next = await gen.next();
  while (!next.done) {
    steps.push(next.value);
    next = await gen.next(next.value.type === "confirm" ? false : undefined);
  }
  return { steps, result: next.value };
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
  getAlias: ReturnType<typeof vi.fn>;
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
    getAlias: vi.fn().mockResolvedValue(null),
  };
}

function mkSdkDeps(overrides: Partial<StaticDeploySdkDeps> = {}): StaticDeploySdkDeps {
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
    ...overrides,
  };
}

interface FakeHandlerDeps extends StaticDeployHandlerDeps {
  logSuccess: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
}

function mkHandlerDeps(overrides: Partial<StaticDeployHandlerDeps> = {}): FakeHandlerDeps {
  const sdkDeps = mkSdkDeps(overrides);
  return {
    ...sdkDeps,
    logSuccess: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SDK generator tests
// ---------------------------------------------------------------------------

describe("staticDeploy SDK generator", () => {
  describe("happy path", () => {
    it("walks identity -> init -> build -> upload -> finalize and returns CommandResult", async () => {
      const deps = mkSdkDeps();
      const { steps, result } = await driveToEnd(staticDeploy({}, deps));

      expect(deps.resolveIdentity).toHaveBeenCalledTimes(1);
      expect(deps.runBuild).toHaveBeenCalledTimes(1);
      expect(deps.walkFiles).toHaveBeenCalledWith("/proj/dist");
      const proxy = (deps.createProxyClient as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<typeof mkProxy>;
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

      // Should have yielded progress steps for upload
      const progressSteps = steps.filter((s) => s.type === "progress");
      expect(progressSteps.length).toBeGreaterThanOrEqual(2);

      // CommandResult should contain deploy data
      expect(result.data.command).toBe("deploy");
      expect(result.data.success).toBe(true);
      expect(result.data.deployId).toBe("20260427-abc1234");
      expect(result.data.url).toBe("https://my-site.preview.freecode.camp");
      expect(result.data.mode).toBe("preview");
      expect(result.format).toContain("20260427-abc1234");
      expect(result.format).toContain("https://my-site.preview.freecode.camp");
    });
  });

  describe("--promote flag", () => {
    it("forwards mode=production to finalize", async () => {
      const deps = mkSdkDeps();
      await driveToEnd(staticDeploy({ promote: true }, deps));
      const proxy = (deps.createProxyClient as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<typeof mkProxy>;
      const finalizeArg = proxy.deployFinalize.mock.calls[0]?.[0] as {
        mode: string;
      };
      expect(finalizeArg.mode).toBe("production");
    });
  });

  describe("--dir flag", () => {
    it("overrides build output directory", async () => {
      const deps = mkSdkDeps({
        runBuild: vi.fn().mockResolvedValue({
          skipped: false,
          outputDir: "/proj/build-out",
        }),
      });
      await driveToEnd(staticDeploy({ dir: "build-out" }, deps));
      const arg = (deps.runBuild as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { outputDir: string };
      expect(arg.outputDir).toBe("build-out");
      expect(deps.walkFiles).toHaveBeenCalledWith("/proj/build-out");
    });
  });

  describe("identity / config errors", () => {
    it("throws CredentialError when identity chain returns null", async () => {
      const deps = mkSdkDeps({
        resolveIdentity: vi.fn().mockResolvedValue(null),
      });
      await expect(driveToEnd(staticDeploy({}, deps))).rejects.toThrow(/login|identity/i);
      expect(deps.runBuild).not.toHaveBeenCalled();
    });

    it("throws ConfigError when platform.yaml is missing", async () => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      const deps = mkSdkDeps({
        readPlatformYaml: vi.fn().mockRejectedValue(err),
      });
      await expect(driveToEnd(staticDeploy({}, deps))).rejects.toThrow(/platform\.yaml/i);
    });

    it("throws ConfigError on v1 platform.yaml fragment", async () => {
      const v1 = "name: my-site\nr2:\n  bucket: x\n";
      const deps = mkSdkDeps({
        readPlatformYaml: vi.fn().mockResolvedValue(v1),
      });
      await expect(driveToEnd(staticDeploy({}, deps))).rejects.toThrow(/v1|migration/i);
    });

    it("throws ConfigError on invalid site name", async () => {
      const bad = "site: BAD-Name\n";
      const deps = mkSdkDeps({
        readPlatformYaml: vi.fn().mockResolvedValue(bad),
      });
      await expect(driveToEnd(staticDeploy({}, deps))).rejects.toThrow();
    });
  });

  describe("preflight authorization (whoami)", () => {
    it("short-circuits BEFORE build when site not authorized", async () => {
      const proxy = mkProxy();
      proxy.whoami.mockResolvedValue({
        login: "freeCodeCamp-bot",
        authorizedSites: ["other-site", "another-site"],
      });
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const err = await driveToEnd(staticDeploy({}, deps)).catch((e) => e);
      expect(err).toBeDefined();
      expect(err.message).toContain("my-site");
      expect(err.message).toContain("freeCodeCamp-bot");
      expect(err.message).toContain("Your authorized sites (2)");
      expect(err.message).toContain("- another-site");
      expect(err.message).toContain("- other-site");
      expect(err.message).not.toContain("universe sites ls --mine");
      expect(err.message).toContain("universe sites register my-site");
      expect(err.message).not.toContain("docs/runbooks");
      expect(err.message).not.toContain("https://github.com/freeCodeCamp/infra");
      expect(err.message).not.toContain("sites.yaml");
      expect(proxy.whoami).toHaveBeenCalledTimes(1);
      expect(deps.runBuild).not.toHaveBeenCalled();
      expect(proxy.deployInit).not.toHaveBeenCalled();
    });

    it("includes a did-you-mean hint when the typo is close to a registered slug", async () => {
      const proxy = mkProxy();
      proxy.whoami.mockResolvedValue({
        login: "raisedadead",
        authorizedSites: ["hello-universe", "gomoku", "test"],
      });
      const deps = mkSdkDeps({
        readPlatformYaml: vi.fn().mockResolvedValue("site: hello-universe-1\n"),
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const err = await driveToEnd(staticDeploy({}, deps)).catch((e) => e);
      expect(err.message).toContain("Did you mean: hello-universe?");
    });

    it("omits did-you-mean when no candidate is close enough", async () => {
      const proxy = mkProxy();
      proxy.whoami.mockResolvedValue({
        login: "raisedadead",
        authorizedSites: ["gomoku", "test"],
      });
      const deps = mkSdkDeps({
        readPlatformYaml: vi.fn().mockResolvedValue("site: forum\n"),
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const err = await driveToEnd(staticDeploy({}, deps)).catch((e) => e);
      expect(err.message).not.toContain("Did you mean");
    });

    it("handles empty authorized-sites list with a distinct message", async () => {
      const proxy = mkProxy();
      proxy.whoami.mockResolvedValue({
        login: "newhire",
        authorizedSites: [],
      });
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const err = await driveToEnd(staticDeploy({}, deps)).catch((e) => e);
      expect(err.message).toContain("authorized for no sites");
      expect(err.message).not.toContain("Did you mean");
      expect(err.message).not.toContain("Your authorized sites (0)");
    });

    it("suppresses the inline list above the scale threshold (>10 entries)", async () => {
      const big = Array.from({ length: 25 }, (_, i) => `site-${i}`);
      const proxy = mkProxy();
      proxy.whoami.mockResolvedValue({
        login: "raisedadead",
        authorizedSites: big,
      });
      const deps = mkSdkDeps({
        readPlatformYaml: vi.fn().mockResolvedValue("site: typo-slug\n"),
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const err = await driveToEnd(staticDeploy({}, deps)).catch((e) => e);
      expect(err.message).toContain("25 authorized sites");
      expect(err.message).toContain("universe sites ls --mine");
      expect(err.message).not.toContain("- site-0");
      expect(err.message).not.toContain("- site-24");
    });

    it("still shows a did-you-mean hint when the list is suppressed", async () => {
      const big = ["hello-universe", ...Array.from({ length: 24 }, (_, i) => `noise-${i}`)];
      const proxy = mkProxy();
      proxy.whoami.mockResolvedValue({
        login: "raisedadead",
        authorizedSites: big,
      });
      const deps = mkSdkDeps({
        readPlatformYaml: vi.fn().mockResolvedValue("site: hello-universe-1\n"),
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const err = await driveToEnd(staticDeploy({}, deps)).catch((e) => e);
      expect(err.message).toContain("Did you mean: hello-universe?");
      expect(err.message).toContain("universe sites ls --mine");
      expect(err.message).not.toContain("- noise-0");
    });

    it("proceeds when site IS in authorizedSites (default happy fixture)", async () => {
      const deps = mkSdkDeps();
      await driveToEnd(staticDeploy({}, deps));
      const proxy = (deps.createProxyClient as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<typeof mkProxy>;
      expect(proxy.whoami).toHaveBeenCalledTimes(1);
      expect(deps.runBuild).toHaveBeenCalledTimes(1);
      expect(proxy.deployInit).toHaveBeenCalledTimes(1);
    });
  });

  describe("git state", () => {
    it("yields warning and proceeds when working tree is dirty", async () => {
      const deps = mkSdkDeps({
        getGitState: vi.fn().mockReturnValue({ hash: "abcdef0", dirty: true }),
      });
      const { steps } = await driveToEnd(staticDeploy({}, deps));
      const warnings = steps.filter((s) => s.type === "warning");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings[0].message).toContain("dirty");
      const proxy = (deps.createProxyClient as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<typeof mkProxy>;
      expect(proxy.deployInit).toHaveBeenCalled();
    });

    it("falls back to a synthetic sha when no git state", async () => {
      const deps = mkSdkDeps({
        getGitState: vi.fn().mockReturnValue({ hash: null, dirty: false, error: "no git" }),
      });
      await driveToEnd(staticDeploy({}, deps));
      const proxy = (deps.createProxyClient as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<typeof mkProxy>;
      const initArg = proxy.deployInit.mock.calls[0]?.[0] as { sha: string };
      expect(initArg.sha).toMatch(/^nogit-/);
    });
  });

  describe("ignore filter", () => {
    it("excludes files matching deploy.ignore patterns", async () => {
      const deps = mkSdkDeps({
        walkFiles: vi.fn().mockReturnValue([
          { relPath: "index.html", absPath: "/p/index.html" },
          { relPath: "main.js.map", absPath: "/p/main.js.map" },
          { relPath: "main.js", absPath: "/p/main.js" },
        ]),
      });
      await driveToEnd(staticDeploy({}, deps));
      const proxy = (deps.createProxyClient as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<typeof mkProxy>;
      const initArg = proxy.deployInit.mock.calls[0]?.[0] as {
        files: string[];
      };
      expect(initArg.files).toEqual(["index.html", "main.js"]);
      const uploadArg = (deps.uploadFiles as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
        files: { relPath: string }[];
      };
      expect(uploadArg.files.map((f) => f.relPath)).toEqual(["index.html", "main.js"]);
    });
  });

  describe("upload errors", () => {
    it("throws PartialUploadError when uploadFiles surfaces errors", async () => {
      const deps = mkSdkDeps({
        uploadFiles: vi.fn().mockResolvedValue({
          fileCount: 1,
          totalSize: 100,
          uploaded: ["a.html"],
          errors: ["b.html: 503"],
        }),
      });
      await expect(driveToEnd(staticDeploy({}, deps))).rejects.toThrow(/partial|failed/i);
      const proxy = (deps.createProxyClient as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<typeof mkProxy>;
      expect(proxy.deployFinalize).not.toHaveBeenCalled();
    });
  });

  describe("proxy errors", () => {
    it("throws ProxyError from deployInit", async () => {
      const proxy = mkProxy();
      proxy.deployInit.mockRejectedValue(new ProxyError(403, "site_unauthorized", "no team"));
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await expect(driveToEnd(staticDeploy({}, deps))).rejects.toThrow(/no team/);
    });

    it("throws ProxyError from deployFinalize", async () => {
      const proxy = mkProxy();
      proxy.deployFinalize.mockRejectedValue(new ProxyError(422, "verify_failed", "missing"));
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await expect(driveToEnd(staticDeploy({}, deps))).rejects.toThrow(/missing/);
    });
  });

  describe("baseUrl resolution", () => {
    it("uses default https://uploads.freecode.camp", async () => {
      const deps = mkSdkDeps();
      await driveToEnd(staticDeploy({}, deps));
      const cfg = (deps.createProxyClient as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
        baseUrl: string;
      };
      expect(cfg.baseUrl).toBe("https://uploads.freecode.camp");
    });

    it("respects $UNIVERSE_PROXY_URL env override", async () => {
      const deps = mkSdkDeps({
        env: { UNIVERSE_PROXY_URL: "https://staging.example" },
      });
      await driveToEnd(staticDeploy({}, deps));
      const cfg = (deps.createProxyClient as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
        baseUrl: string;
      };
      expect(cfg.baseUrl).toBe("https://staging.example");
    });
  });

  describe("SDK always yields warnings/info (no json gating)", () => {
    it("yields info when build is skipped", async () => {
      const deps = mkSdkDeps({
        runBuild: vi.fn().mockResolvedValue({
          skipped: true,
          outputDir: "/proj/dist",
        }),
      });
      const { steps } = await driveToEnd(staticDeploy({}, deps));
      const infoSteps = steps.filter((s) => s.type === "info");
      expect(infoSteps.length).toBeGreaterThanOrEqual(1);
      expect(infoSteps.some((s) => s.message.includes("build.command not set"))).toBe(true);
    });

    it("yields warning when git is dirty", async () => {
      const deps = mkSdkDeps({
        getGitState: vi.fn().mockReturnValue({
          hash: "abc1234567",
          dirty: true,
        }),
      });
      const { steps } = await driveToEnd(staticDeploy({}, deps));
      const warnings = steps.filter((s) => s.type === "warning");
      expect(warnings.some((s) => s.message.includes("dirty"))).toBe(true);
    });
  });

  describe("upload progress (onProgress callback)", () => {
    it("passes onProgress to uploadFiles when provided", async () => {
      const onProgress = vi.fn();
      const fakeUpload = vi
        .fn()
        .mockImplementation(
          async (opts: {
            onProgress?: (p: { uploaded: number; total: number; current: string }) => void;
          }) => {
            opts.onProgress?.({
              uploaded: 1,
              total: 2,
              current: "index.html",
            });
            opts.onProgress?.({
              uploaded: 2,
              total: 2,
              current: "main.js",
            });
            return {
              fileCount: 2,
              totalSize: 2048,
              uploaded: ["index.html", "main.js"],
              errors: [],
            };
          },
        );
      const deps = mkSdkDeps({ uploadFiles: fakeUpload, onProgress });
      await driveToEnd(staticDeploy({}, deps));

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ uploaded: 1, total: 2, current: "index.html" }),
      );
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ uploaded: 2, total: 2, current: "main.js" }),
      );
    });

    it("does not crash when onProgress is not provided", async () => {
      const deps = mkSdkDeps();
      // No onProgress in deps
      const { result } = await driveToEnd(staticDeploy({}, deps));
      expect(result.data.success).toBe(true);
    });
  });

  describe("preview-divergence warn on --promote", () => {
    it("yields warning when preview alias points to a prior deploy id", async () => {
      const proxy = mkProxy();
      proxy.deployFinalize.mockResolvedValue({
        url: "https://my-site.freecode.camp",
        deployId: "20260427-abc1234",
        mode: "production",
      });
      proxy.getAlias.mockResolvedValue({
        url: "https://my-site.preview.freecode.camp",
        deployId: "20260425-old00000",
      });
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const { steps } = await driveToEnd(staticDeploy({ promote: true }, deps));
      expect(proxy.getAlias).toHaveBeenCalledWith({
        site: "my-site",
        mode: "preview",
      });
      const warnings = steps.filter((s) => s.type === "warning");
      expect(warnings.some((s) => s.message.includes("20260425-old00000"))).toBe(true);
    });

    it("does NOT yield warning when preview alias matches the new deploy id", async () => {
      const proxy = mkProxy();
      proxy.deployFinalize.mockResolvedValue({
        url: "https://my-site.freecode.camp",
        deployId: "20260427-abc1234",
        mode: "production",
      });
      proxy.getAlias.mockResolvedValue({
        url: "https://my-site.preview.freecode.camp",
        deployId: "20260427-abc1234",
      });
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const { steps } = await driveToEnd(staticDeploy({ promote: true }, deps));
      const warnings = steps.filter((s) => s.type === "warning");
      expect(warnings.every((s) => !s.message.includes("Preview alias still points"))).toBe(true);
    });

    it("does NOT yield warning when no preview alias exists", async () => {
      const proxy = mkProxy();
      proxy.deployFinalize.mockResolvedValue({
        url: "https://my-site.freecode.camp",
        deployId: "20260427-abc1234",
        mode: "production",
      });
      proxy.getAlias.mockResolvedValue(null);
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const { steps } = await driveToEnd(staticDeploy({ promote: true }, deps));
      const warnings = steps.filter((s) => s.type === "warning");
      expect(warnings.every((s) => !s.message.includes("Preview alias still points"))).toBe(true);
    });

    it("skips the side-call on a regular (non-promote) preview deploy", async () => {
      const proxy = mkProxy();
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await driveToEnd(staticDeploy({}, deps));
      expect(proxy.getAlias).not.toHaveBeenCalled();
    });

    it("does not crash if getAlias itself fails", async () => {
      const proxy = mkProxy();
      proxy.deployFinalize.mockResolvedValue({
        url: "https://my-site.freecode.camp",
        deployId: "20260427-abc1234",
        mode: "production",
      });
      proxy.getAlias.mockRejectedValue(new Error("network glitch"));
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const { result } = await driveToEnd(staticDeploy({ promote: true }, deps));
      expect(result.data.success).toBe(true);
    });
  });

  describe("promote dedup — same hash (#8)", () => {
    it("promotes the existing preview when sha matches, skipping build/upload", async () => {
      const proxy = mkProxy();
      proxy.getAlias.mockResolvedValue({
        url: "https://my-site.preview.freecode.camp",
        deployId: "20260512-120000-abc1234",
      });
      proxy.sitePromote.mockResolvedValue({
        url: "https://my-site.freecode.camp",
        deployId: "20260512-120000-abc1234",
      });
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const { steps, result } = await driveToEnd(staticDeploy({ promote: true }, deps));
      expect(proxy.getAlias).toHaveBeenCalledWith({
        site: "my-site",
        mode: "preview",
      });
      expect(deps.runBuild).not.toHaveBeenCalled();
      expect(proxy.deployInit).not.toHaveBeenCalled();
      expect(deps.uploadFiles).not.toHaveBeenCalled();
      expect(proxy.sitePromote).toHaveBeenCalledWith({
        site: "my-site",
        deployId: "20260512-120000-abc1234",
      });
      // Should have yielded an info step
      const infoSteps = steps.filter((s) => s.type === "info");
      expect(infoSteps.some((s) => s.message.includes("already at this commit"))).toBe(true);
      // Result data should include reusedPreview
      expect(result.data.reusedPreview).toBe(true);
      expect(result.data.mode).toBe("production");
      expect(result.data.deployId).toBe("20260512-120000-abc1234");
      expect(result.format).toContain("20260512-120000-abc1234");
      expect(result.format).toContain("production");
    });

    it("does NOT dedup when the working tree is dirty", async () => {
      const proxy = mkProxy();
      proxy.getAlias.mockResolvedValue({
        url: "https://my-site.preview.freecode.camp",
        deployId: "20260512-120000-abc1234",
      });
      const deps = mkSdkDeps({
        getGitState: vi.fn().mockReturnValue({ hash: "abc1234567", dirty: true }),
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await driveToEnd(staticDeploy({ promote: true }, deps));
      expect(deps.runBuild).toHaveBeenCalled();
      expect(proxy.sitePromote).not.toHaveBeenCalled();
    });

    it("does NOT dedup when the preview sha differs from HEAD", async () => {
      const proxy = mkProxy();
      proxy.getAlias.mockResolvedValue({
        url: "https://my-site.preview.freecode.camp",
        deployId: "20260512-120000-zzz9999",
      });
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await driveToEnd(staticDeploy({ promote: true }, deps));
      expect(deps.runBuild).toHaveBeenCalled();
      expect(proxy.sitePromote).not.toHaveBeenCalled();
    });
  });

  describe("root index.html preflight", () => {
    it("throws when index.html is missing and never uploads", async () => {
      const proxy = mkProxy();
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
        walkFiles: vi.fn().mockReturnValue([
          { relPath: "main.js", absPath: "/proj/dist/main.js" },
          {
            relPath: "assets/index.html",
            absPath: "/proj/dist/assets/index.html",
          },
        ]),
      });
      await expect(driveToEnd(staticDeploy({}, deps))).rejects.toThrow(/index\.html/i);
      expect(proxy.deployInit).not.toHaveBeenCalled();
      expect(deps.uploadFiles).not.toHaveBeenCalled();
    });

    it("surfaces the static-export hint for a framework build directory", async () => {
      const proxy = mkProxy();
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
        walkFiles: vi.fn().mockReturnValue([
          { relPath: "BUILD_ID", absPath: "/proj/dist/BUILD_ID" },
          {
            relPath: "build-manifest.json",
            absPath: "/proj/dist/build-manifest.json",
          },
          { relPath: "server/app.js", absPath: "/proj/dist/server/app.js" },
        ]),
      });
      await expect(driveToEnd(staticDeploy({}, deps))).rejects.toThrow(/static export/);
    });
  });
});

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe("staticDeployHandler", () => {
  describe("happy path", () => {
    it("emits success envelope in JSON mode", async () => {
      const stdout: string[] = [];
      const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });

      const deps = mkHandlerDeps();
      await staticDeployHandler({ json: true }, deps);
      writeSpy.mockRestore();

      const env = JSON.parse(stdout.join("").trim());
      expect(env.command).toBe("deploy");
      expect(env.success).toBe(true);
      expect(env.deployId).toBe("20260427-abc1234");
      expect(env.url).toBe("https://my-site.preview.freecode.camp");
      expect(env.mode).toBe("preview");
      expect(env.fileCount).toBe(2);
    });

    it("calls logSuccess with deploy info in non-JSON mode", async () => {
      const deps = mkHandlerDeps();
      await staticDeployHandler({ json: false }, deps);
      const msg = deps.logSuccess.mock.calls[0]?.[0] ?? "";
      expect(msg).toContain("20260427-abc1234");
      expect(msg).toContain("https://my-site.preview.freecode.camp");
    });
  });

  describe("error handling", () => {
    it("calls exit with EXIT_CREDENTIALS when identity chain returns null", async () => {
      const deps = mkHandlerDeps({
        resolveIdentity: vi.fn().mockResolvedValue(null),
      });
      await expect(staticDeployHandler({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.runBuild).not.toHaveBeenCalled();
      expect(deps.exit).toHaveBeenCalledWith(12);
      expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/login|identity/i));
    });

    it("calls exit with EXIT_CONFIG when platform.yaml is missing", async () => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      const deps = mkHandlerDeps({
        readPlatformYaml: vi.fn().mockRejectedValue(err),
      });
      await expect(staticDeployHandler({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(11);
      expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/platform\.yaml/i));
    });

    it("calls exit with EXIT_PARTIAL when uploadFiles surfaces errors", async () => {
      const deps = mkHandlerDeps({
        uploadFiles: vi.fn().mockResolvedValue({
          fileCount: 1,
          totalSize: 100,
          uploaded: ["a.html"],
          errors: ["b.html: 503"],
        }),
      });
      await expect(staticDeployHandler({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(19);
      expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/partial|failed/i));
    });

    it("propagates ProxyError from deployInit", async () => {
      const proxy = mkProxy();
      proxy.deployInit.mockRejectedValue(new ProxyError(403, "site_unauthorized", "no team"));
      const deps = mkHandlerDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await expect(staticDeployHandler({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(12);
      expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining("no team"));
    });

    it("surfaces user_unauthorized hint", async () => {
      const proxy = mkProxy();
      proxy.deployInit.mockRejectedValue(
        new ProxyError(403, "user_unauthorized", "caller is not on the required team", "req-42", "check SSO"),
      );
      const deps = mkHandlerDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await expect(staticDeployHandler({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(12);
      const msg = (deps.logError.mock.calls[0]?.[0] as string) ?? "";
      expect(msg).toContain("deploy failed (user_unauthorized)");
      expect(msg).toContain("deploy init failed:");
      expect(msg).toContain("read:org");
    });

    it("propagates ProxyError from deployFinalize", async () => {
      const proxy = mkProxy();
      proxy.deployFinalize.mockRejectedValue(new ProxyError(422, "verify_failed", "missing"));
      const deps = mkHandlerDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await expect(staticDeployHandler({ json: false }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(13);
      expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining("missing"));
    });
  });

  describe("promote dedup in JSON mode", () => {
    it("emits reusedPreview in the JSON envelope", async () => {
      const proxy = mkProxy();
      proxy.getAlias.mockResolvedValue({
        url: "https://my-site.preview.freecode.camp",
        deployId: "20260512-120000-abc1234",
      });
      proxy.sitePromote.mockResolvedValue({
        url: "https://my-site.freecode.camp",
        deployId: "20260512-120000-abc1234",
      });
      const deps = mkHandlerDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const stdout: string[] = [];
      const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });
      await staticDeployHandler({ json: true, promote: true }, deps);
      writeSpy.mockRestore();

      const env = JSON.parse(stdout.join("").trim());
      expect(env.command).toBe("deploy");
      expect(env.reusedPreview).toBe(true);
      expect(env.mode).toBe("production");
      expect(env.deployId).toBe("20260512-120000-abc1234");
      expect(deps.runBuild).not.toHaveBeenCalled();
    });
  });
});
