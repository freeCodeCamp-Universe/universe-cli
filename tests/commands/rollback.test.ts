import { describe, expect, it, vi } from "vitest";
import { rollback } from "../../src/commands/rollback.js";
import { AliasDriftError, ProxyError } from "../../src/lib/proxy-client.js";

const VALID_YAML = "site: my-site\n";

function mkProxy(): {
  whoami: ReturnType<typeof vi.fn>;
  deployInit: ReturnType<typeof vi.fn>;
  deployUpload: ReturnType<typeof vi.fn>;
  deployFinalize: ReturnType<typeof vi.fn>;
  siteDeploys: ReturnType<typeof vi.fn>;
  getAlias: ReturnType<typeof vi.fn>;
  sitePromote: ReturnType<typeof vi.fn>;
  siteRollback: ReturnType<typeof vi.fn>;
} {
  return {
    whoami: vi.fn(),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    deployFinalize: vi.fn(),
    siteDeploys: vi.fn(),
    getAlias: vi.fn().mockResolvedValue({ url: "https://x.freecode.camp", deployId: "PROD1" }),
    sitePromote: vi.fn(),
    siteRollback: vi.fn().mockResolvedValue({
      url: "https://my-site.freecode.camp",
      deployId: "older",
    }),
  };
}

interface FakeDeps {
  cwd: string;
  env: NodeJS.ProcessEnv;
  readPlatformYaml: ReturnType<typeof vi.fn>;
  resolveIdentity: ReturnType<typeof vi.fn>;
  createProxyClient: ReturnType<typeof vi.fn>;
  logSuccess: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
  promptConfirm: ReturnType<typeof vi.fn>;
}

function mkDeps(overrides: Partial<FakeDeps> = {}): FakeDeps {
  return {
    cwd: "/proj",
    env: {},
    readPlatformYaml: vi.fn().mockResolvedValue(VALID_YAML),
    resolveIdentity: vi.fn().mockResolvedValue({
      token: "ghp_x",
      source: "env_GITHUB_TOKEN",
    }),
    createProxyClient: vi.fn().mockReturnValue(mkProxy()),
    logSuccess: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    }),
    promptConfirm: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe("rollback command", () => {
  it("pre-flights getAlias(production) and pins expectedCurrent", async () => {
    const deps = mkDeps();
    await rollback({ json: false, to: "older" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<typeof mkProxy>;
    expect(proxy.getAlias).toHaveBeenCalledWith({
      site: "my-site",
      mode: "production",
    });
    expect(proxy.siteRollback).toHaveBeenCalledWith({
      site: "my-site",
      to: "older",
      expectedCurrent: "PROD1",
    });
  });

  it("sends empty expectedCurrent when production alias absent", async () => {
    const proxy = mkProxy();
    proxy.getAlias.mockResolvedValue(null);
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await rollback({ json: false, to: "older" }, deps);
    expect(proxy.siteRollback).toHaveBeenCalledWith({
      site: "my-site",
      to: "older",
      expectedCurrent: "",
    });
  });

  it("emits success envelope in JSON mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    const deps = mkDeps();
    await rollback({ json: true, to: "older" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("rollback");
    expect(env.success).toBe(true);
    expect(env.deployId).toBe("older");
    expect(env.url).toBe("https://my-site.freecode.camp");
  });

  it("errors with EXIT_USAGE when --to is missing", async () => {
    const deps = mkDeps();
    await expect(rollback({ json: false, to: undefined }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/--to/i));
  });

  it("errors with EXIT_CREDENTIALS when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(rollback({ json: false, to: "x" }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(12);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/login|identity/i));
  });

  it("propagates 422 deploy_missing as EXIT_STORAGE", async () => {
    const proxy = mkProxy();
    proxy.siteRollback.mockRejectedValue(
      new ProxyError(422, "deploy_missing", "target deploy no longer exists in r2"),
    );
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(rollback({ json: false, to: "ancient" }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(13);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining("no longer exists"));
  });

  describe("409 alias_drift handling", () => {
    it("JSON mode emits envelope with top-level current field, no retry", async () => {
      const proxy = mkProxy();
      proxy.siteRollback.mockRejectedValueOnce(new AliasDriftError("drift", "newer-id"));
      const deps = mkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const stdout: string[] = [];
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });
      await expect(rollback({ json: true, to: "older" }, deps)).rejects.toThrow("__exit__");
      spy.mockRestore();
      const env = JSON.parse(stdout.join("").trim());
      expect(env.success).toBe(false);
      expect(env.current).toBe("newer-id");
      expect((env.error as { message: string }).message).toContain("alias_drift");
      expect(deps.exit).toHaveBeenCalledWith(10);
      expect(deps.promptConfirm).not.toHaveBeenCalled();
      expect(proxy.siteRollback).toHaveBeenCalledTimes(1);
    });

    it("non-JSON one-shot retry on confirm=yes re-pins with server current", async () => {
      const proxy = mkProxy();
      proxy.siteRollback
        .mockRejectedValueOnce(new AliasDriftError("drift", "newer-id"))
        .mockResolvedValueOnce({
          url: "https://my-site.freecode.camp",
          deployId: "older",
        });
      const deps = mkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
        promptConfirm: vi.fn().mockResolvedValue(true),
      });
      await rollback({ json: false, to: "older" }, deps);
      expect(deps.exit).not.toHaveBeenCalled();
      expect(proxy.siteRollback).toHaveBeenCalledTimes(2);
      expect(proxy.siteRollback).toHaveBeenNthCalledWith(2, {
        site: "my-site",
        to: "older",
        expectedCurrent: "newer-id",
      });
    });

    it("non-JSON confirm=no exits with EXIT_USAGE, no retry", async () => {
      const proxy = mkProxy();
      proxy.siteRollback.mockRejectedValueOnce(new AliasDriftError("drift", "newer-id"));
      const deps = mkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
        promptConfirm: vi.fn().mockResolvedValue(false),
      });
      await expect(rollback({ json: false, to: "older" }, deps)).rejects.toThrow("__exit__");
      expect(deps.exit).toHaveBeenCalledWith(10);
      expect(proxy.siteRollback).toHaveBeenCalledTimes(1);
    });
  });
});
