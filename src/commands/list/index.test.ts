import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import { ConfigError, CredentialError } from "../../errors/cli-errors.js";
import { writeJson } from "../../output/write-json.js";
import type { ProxyClient } from "../../platform/proxy-client.port.js";
import { handleList } from "./index.js";

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
    siteDeploys: vi
      .fn()
      .mockResolvedValue([
        { deployId: "20260427-141522-abc1234" },
        { deployId: "20260426-101005-def5678" },
      ]),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
    whoami: vi.fn(),
  };
  return {
    identityResolver,
    logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    proxyClient,
    readFile: vi.fn().mockResolvedValue(PLATFORM_YAML),
  };
};

describe(handleList, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws CredentialError when identity resolves to null", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.identityResolver, "resolve").mockResolvedValue(null);
    await expect(handleList({ cwd: "/proj", json: false }, deps)).rejects.toThrow(CredentialError);
  });

  it("throws ConfigError when platform.yaml cannot be read", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "readFile").mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    await expect(handleList({ cwd: "/proj", json: false }, deps)).rejects.toThrow(ConfigError);
  });

  it("throws ConfigError when platform.yaml is invalid", async () => {
    const deps = makeDeps();
    vi.spyOn(deps, "readFile").mockResolvedValue("- not: a mapping");
    await expect(handleList({ cwd: "/proj", json: false }, deps)).rejects.toThrow(ConfigError);
  });

  it("uses --site override instead of platform.yaml site", async () => {
    const deps = makeDeps();
    const deploysSpy = vi.spyOn(deps.proxyClient, "siteDeploys");
    await handleList({ cwd: "/proj", json: false, site: "override-site" }, deps);
    expect(deploysSpy).toHaveBeenCalledWith({ site: "override-site" });
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  it("calls siteDeploys with the site name from platform.yaml", async () => {
    const deps = makeDeps();
    const deploysSpy = vi.spyOn(deps.proxyClient, "siteDeploys");
    await handleList({ cwd: "/proj", json: false }, deps);
    expect(deploysSpy).toHaveBeenCalledWith({ site: "my-site" });
  });

  it("with json: false calls logger.success with a formatted table", async () => {
    const deps = makeDeps();
    await handleList({ cwd: "/proj", json: false }, deps);
    expect(deps.logger.success).toHaveBeenCalledOnce();
    const msg = deps.logger.success.mock.calls[0]![0] as string;
    expect(msg).toContain("DEPLOY ID");
    expect(msg).toContain("TIMESTAMP");
    expect(msg).toContain("SHA");
    expect(msg).toContain("20260427-141522-abc1234");
  });

  it("with json: false calls logger.info when there are no deploys", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.proxyClient, "siteDeploys").mockResolvedValue([]);
    await handleList({ cwd: "/proj", json: false }, deps);
    expect(deps.logger.info).toHaveBeenCalledWith(expect.stringContaining("no deploys"));
  });

  it("with json: true calls writeJson with command and deploys", async () => {
    const deps = makeDeps();
    await handleList({ cwd: "/proj", json: true }, deps);
    expect(writeJson).toHaveBeenCalledWith(
      "static list",
      true,
      expect.objectContaining({ site: "my-site" }),
    );
  });

  it("writeJson deploys include parsed timestamp and sha", async () => {
    const deps = makeDeps();
    await handleList({ cwd: "/proj", json: true }, deps);
    const data = vi.mocked(writeJson).mock.calls[0]![2] as {
      deploys: { deployId: string; sha: string | null; timestamp: string | null }[];
    };
    expect(data.deploys[0]).toStrictEqual({
      deployId: "20260427-141522-abc1234",
      sha: "abc1234",
      timestamp: "2026-04-27T14:15:22Z",
    });
  });

  it("writeJson falls back to null timestamp and sha for unparseable deploy id", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.proxyClient, "siteDeploys").mockResolvedValue([{ deployId: "weird-id" }]);
    await handleList({ cwd: "/proj", json: true }, deps);
    const data = vi.mocked(writeJson).mock.calls[0]![2] as {
      deploys: { deployId: string; sha: null; timestamp: null }[];
    };
    expect(data.deploys[0]).toStrictEqual({ deployId: "weird-id", sha: null, timestamp: null });
  });
});
