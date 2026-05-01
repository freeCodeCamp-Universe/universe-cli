import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import { ConfigError, CredentialError, UsageError } from "../../errors/cli-errors.js";
import { writeJson } from "../../output/write-json.js";
import type { ProxyClient } from "../../platform/proxy-client.port.js";
import { handleRollback } from "./index.js";

vi.mock(import("../../output/write-json.js"));

const PLATFORM_YAML = "site: my-site\n";

const makeDeps = () => {
  const identityResolver: IdentityResolver = {
    resolve: vi.fn().mockResolvedValue({ source: "env_GITHUB_TOKEN", token: "token-abc" }),
  };
  const proxyClient: ProxyClient = {
    deployFinalize: vi.fn(),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    siteDeploys: vi.fn(),
    sitePromote: vi.fn(),
    siteRollback: vi.fn().mockResolvedValue({ deployId: "d0", url: "https://my-site.pages.dev" }),
    whoami: vi.fn(),
  };
  return {
    identityResolver,
    logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    proxyClient,
    readFile: vi.fn().mockResolvedValue(PLATFORM_YAML),
  };
};

describe(handleRollback, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws UsageError when --to is absent", async () => {
    const deps = makeDeps();
    await expect(
      handleRollback({ cwd: "/proj", json: false, to: undefined }, deps),
    ).rejects.toThrow(UsageError);
  });

  it("throws CredentialError when identity resolves to null", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.identityResolver, "resolve").mockResolvedValue(null);
    await expect(handleRollback({ cwd: "/proj", json: false, to: "d0" }, deps)).rejects.toThrow(
      CredentialError,
    );
  });

  it("throws ConfigError when platform.yaml cannot be read", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "readFile").mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    await expect(handleRollback({ cwd: "/proj", json: false, to: "d0" }, deps)).rejects.toThrow(
      ConfigError,
    );
  });

  it("throws ConfigError when platform.yaml is invalid", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "readFile").mockResolvedValue("- not: a mapping");
    await expect(handleRollback({ cwd: "/proj", json: false, to: "d0" }, deps)).rejects.toThrow(
      ConfigError,
    );
  });

  it("calls siteRollback with site and target deploy id", async () => {
    const deps = makeDeps();
    const rollbackSpy = vi.spyOn(deps.proxyClient, "siteRollback");
    await handleRollback({ cwd: "/proj", json: false, to: "d0" }, deps);
    expect(rollbackSpy).toHaveBeenCalledWith({ site: "my-site", to: "d0" });
  });

  it("with json: false calls logger.success", async () => {
    const deps = makeDeps();
    await handleRollback({ cwd: "/proj", json: false, to: "d0" }, deps);
    expect(deps.logger.success).toHaveBeenCalledOnce();
  });

  it("with json: true calls writeJson with command=static rollback and success=true", async () => {
    const deps = makeDeps();
    await handleRollback({ cwd: "/proj", json: true, to: "d0" }, deps);
    expect(writeJson).toHaveBeenCalledWith(
      "static rollback",
      true,
      expect.objectContaining({ deployId: "d0", site: "my-site" }),
    );
  });
});
