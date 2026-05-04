import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import { ConfigError, CredentialError, PartialUploadError } from "../../errors/cli-errors.js";
import { EXIT_CREDENTIALS, EXIT_STORAGE } from "../../errors/exit-codes.js";
import { writeJson } from "../../output/write-json.js";
import { ProxyError } from "../../platform/proxy-client.port.js";
import type { ProxyClient } from "../../platform/proxy-client.port.js";
import { handleDeploy } from "./index.js";

vi.mock(import("../../output/write-json.js"));

const PLATFORM_YAML = "site: my-site\n";
const HASH = "abc123def456";

const makeDeps = () => {
  const identityResolver: IdentityResolver = {
    resolve: vi.fn().mockResolvedValue({ source: "env_GITHUB_TOKEN", token: "token-abc" }),
  };
  const proxyClient: ProxyClient = {
    deployFinalize: vi.fn().mockResolvedValue({
      deployId: "d1",
      mode: "preview",
      url: "https://preview.my-site.pages.dev",
    }),
    deployInit: vi
      .fn()
      .mockResolvedValue({ deployId: "d1", expiresAt: "2099-01-01T00:00:00Z", jwt: "jwt-1" }),
    deployUpload: vi.fn().mockResolvedValue({ key: "my-site/index.html", received: "ok" }),
    siteDeploys: vi.fn(),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
    whoami: vi.fn().mockResolvedValue({ authorizedSites: ["my-site"], login: "staffuser" }),
  };
  return {
    getGitState: vi.fn().mockReturnValue({ dirty: false, hash: HASH }),
    identityResolver,
    logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    proxyClient,
    readFile: vi.fn().mockResolvedValue(PLATFORM_YAML),
    runBuild: vi.fn().mockResolvedValue({ outputDir: "/tmp/fake-dist", skipped: true }),
    uploadFiles: vi
      .fn()
      .mockResolvedValue({ errors: [], fileCount: 1, totalSize: 512, uploaded: ["index.html"] }),
    walkFiles: vi
      .fn()
      .mockReturnValue([{ absPath: "/tmp/fake-dist/index.html", relPath: "index.html" }]),
  };
};

describe(handleDeploy, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws CredentialError when identity resolves to null", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.identityResolver, "resolve").mockResolvedValue(null);
    await expect(handleDeploy({ cwd: "/proj", json: false }, deps)).rejects.toThrow(
      CredentialError,
    );
  });

  it("throws ConfigError when platform.yaml cannot be read", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "readFile").mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    await expect(handleDeploy({ cwd: "/proj", json: false }, deps)).rejects.toThrow(ConfigError);
  });

  it("throws ConfigError when platform.yaml is invalid", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "readFile").mockResolvedValue("- not: a mapping");
    await expect(handleDeploy({ cwd: "/proj", json: false }, deps)).rejects.toThrow(ConfigError);
  });

  it("throws CredentialError when site is not in authorizedSites", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.proxyClient, "whoami").mockResolvedValue({
      authorizedSites: ["other-site"],
      login: "staffuser",
    });
    await expect(handleDeploy({ cwd: "/proj", json: false }, deps)).rejects.toThrow(
      CredentialError,
    );
  });

  it("warns when working tree is dirty", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "getGitState").mockReturnValue({ dirty: true, hash: HASH });
    await handleDeploy({ cwd: "/proj", json: false }, deps);
    expect(deps.logger.warn).toHaveBeenCalledOnce();
  });

  it("calls runBuild with config from platform.yaml", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "readFile").mockResolvedValue(
      "site: my-site\nbuild:\n  command: npm run build\n  output: out\n",
    );
    await handleDeploy({ cwd: "/proj", json: false }, deps);
    expect(deps.runBuild).toHaveBeenCalledWith(
      expect.objectContaining({ command: "npm run build", outputDir: "out" }),
    );
  });

  it("calls walkFiles with the build output directory", async () => {
    const deps = makeDeps();
    await handleDeploy({ cwd: "/proj", json: false }, deps);
    expect(deps.walkFiles).toHaveBeenCalledWith("/tmp/fake-dist");
  });

  it("calls deployInit with site, sha, and file list", async () => {
    const deps = makeDeps();
    const deployInitSpy = vi.spyOn(deps.proxyClient, "deployInit");
    await handleDeploy({ cwd: "/proj", json: false }, deps);
    expect(deployInitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ files: ["index.html"], sha: HASH, site: "my-site" }),
    );
  });

  it("calls uploadFiles before deployFinalize", async () => {
    const order: string[] = [];
    const deps = makeDeps();
    vi.spyOn(deps, "uploadFiles").mockImplementation(() => {
      order.push("upload");
      return Promise.resolve({ errors: [], fileCount: 1, totalSize: 1, uploaded: [] });
    });
    vi.spyOn(deps.proxyClient, "deployFinalize").mockImplementation(() => {
      order.push("finalize");
      return Promise.resolve({
        deployId: "d1",
        mode: "preview",
        url: "https://preview.my-site.pages.dev",
      });
    });
    await handleDeploy({ cwd: "/proj", json: false }, deps);
    expect(order).toStrictEqual(["upload", "finalize"]);
  });

  it("throws PartialUploadError when any upload fails", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "uploadFiles").mockResolvedValue({
      errors: ["index.html: upload failed"],
      fileCount: 0,
      totalSize: 0,
      uploaded: [],
    });
    await expect(handleDeploy({ cwd: "/proj", json: false }, deps)).rejects.toThrow(
      PartialUploadError,
    );
  });

  it("with json: false calls logger.success", async () => {
    const deps = makeDeps();
    await handleDeploy({ cwd: "/proj", json: false }, deps);
    expect(deps.logger.success).toHaveBeenCalledOnce();
  });

  it("with json: true calls writeJson with command=static deploy and success=true", async () => {
    const deps = makeDeps();
    await handleDeploy({ cwd: "/proj", json: true }, deps);
    expect(writeJson).toHaveBeenCalledWith(
      "static deploy",
      true,
      expect.objectContaining({ deployId: "d1", site: "my-site" }),
    );
  });

  it("--promote flag forwards mode=production to deployFinalize", async () => {
    const deps = makeDeps();
    const finalizeSpy = vi.spyOn(deps.proxyClient, "deployFinalize");
    await handleDeploy({ cwd: "/proj", json: false, promote: true }, deps);
    expect(finalizeSpy).toHaveBeenCalledWith(expect.objectContaining({ mode: "production" }));
  });

  it("--dir flag passes dir as outputDir to runBuild", async () => {
    const deps = makeDeps();
    await handleDeploy({ cwd: "/proj", dir: "custom-out", json: false }, deps);
    expect(deps.runBuild).toHaveBeenCalledWith(
      expect.objectContaining({ outputDir: "custom-out" }),
    );
  });

  it("throws ConfigError for v1 platform.yaml with migration message", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "readFile").mockResolvedValue("name: my-site\nr2:\n  bucket: my-bucket\n");
    const err = await handleDeploy({ cwd: "/proj", json: false }, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).message).toMatch(/v1|migration/i);
  });

  it("throws ConfigError for invalid site name", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "readFile").mockResolvedValue("site: BAD-Name\n");
    await expect(handleDeploy({ cwd: "/proj", json: false }, deps)).rejects.toThrow(ConfigError);
  });

  it("not-authorized error message includes runbook URL", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.proxyClient, "whoami").mockResolvedValue({
      authorizedSites: ["other-site"],
      login: "staffuser",
    });
    let thrownErr: unknown;
    await handleDeploy({ cwd: "/proj", json: false }, deps).catch((e) => {
      thrownErr = e;
    });
    expect(thrownErr).toBeInstanceOf(CredentialError);
    expect((thrownErr as CredentialError).message).toContain(
      "freeCodeCamp/infra/blob/main/docs/runbooks/01-deploy-new-constellation-site.md",
    );
  });

  it("falls back to nogit- synthetic sha when git hash is null", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "getGitState").mockReturnValue({ dirty: false, hash: null });
    const initSpy = vi.spyOn(deps.proxyClient, "deployInit");
    await handleDeploy({ cwd: "/proj", json: false }, deps);
    expect(initSpy.mock.calls[0]![0].sha).toMatch(/^nogit-/);
  });

  it("deploy.ignore patterns filter files before deployInit and uploadFiles", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "readFile").mockResolvedValue(
      "site: my-site\ndeploy:\n  ignore:\n    - '*.map'\n",
    );
    vi.spyOn(deps, "walkFiles").mockReturnValue([
      { absPath: "/tmp/d/index.html", relPath: "index.html" },
      { absPath: "/tmp/d/main.js.map", relPath: "main.js.map" },
      { absPath: "/tmp/d/main.js", relPath: "main.js" },
    ]);
    const initSpy = vi.spyOn(deps.proxyClient, "deployInit");
    const uploadSpy = vi.spyOn(deps, "uploadFiles");
    await handleDeploy({ cwd: "/proj", json: false }, deps);
    expect(initSpy.mock.calls[0]![0].files).toStrictEqual(["index.html", "main.js"]);
    const uploadArg = uploadSpy.mock.calls[0]![0] as { files: { relPath: string }[] };
    expect(uploadArg.files.map((f) => f.relPath)).toStrictEqual(["index.html", "main.js"]);
  });

  it("proxyError from deployInit propagates with correct exitCode", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.proxyClient, "deployInit").mockRejectedValue(
      new ProxyError(403, "site_unauthorized", "no team"),
    );
    const err = await handleDeploy({ cwd: "/proj", json: false }, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProxyError);
    expect((err as ProxyError).exitCode).toBe(EXIT_CREDENTIALS);
  });

  it("proxyError from deployFinalize propagates with correct exitCode", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.proxyClient, "deployFinalize").mockRejectedValue(
      new ProxyError(422, "verify_failed", "missing"),
    );
    const err = await handleDeploy({ cwd: "/proj", json: false }, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProxyError);
    expect((err as ProxyError).exitCode).toBe(EXIT_STORAGE);
  });
});
