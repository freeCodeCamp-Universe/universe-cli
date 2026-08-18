import { describe, expect, it, vi } from "vitest";
import { staticRollback, staticRollbackHandler } from "../../src/commands/rollback.js";
import { drive } from "../../src/interaction/driver.js";
import type { Step, StepResponse } from "../../src/interaction/step.js";
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

function mkSdkDeps(overrides: Record<string, unknown> = {}) {
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

const autoReject: (step: Step) => Promise<StepResponse> = async (step) =>
  step.type === "confirm" ? false : undefined;

const autoAccept: (step: Step) => Promise<StepResponse> = async (step) =>
  step.type === "confirm" ? true : undefined;

describe("staticRollback SDK", () => {
  it("pre-flights getAlias(production) and pins expectedCurrent", async () => {
    const deps = mkSdkDeps();
    await drive(staticRollback({ to: "older" }, deps), autoReject, () => {});
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<typeof mkProxy>;
    expect(proxy.getAlias).toHaveBeenCalledWith({ site: "my-site", mode: "production" });
    expect(proxy.siteRollback).toHaveBeenCalledWith({
      site: "my-site",
      to: "older",
      expectedCurrent: "PROD1",
    });
  });

  it("sends empty expectedCurrent when production alias absent", async () => {
    const proxy = mkProxy();
    proxy.getAlias.mockResolvedValue(null);
    const deps = mkSdkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await drive(staticRollback({ to: "older" }, deps), autoReject, () => {});
    expect(proxy.siteRollback).toHaveBeenCalledWith({
      site: "my-site",
      to: "older",
      expectedCurrent: "",
    });
  });

  it("returns CommandResult on success", async () => {
    const deps = mkSdkDeps();
    const result = await drive(staticRollback({ to: "older" }, deps), autoReject, () => {});
    expect(result.data.command).toBe("rollback");
    expect(result.data.success).toBe(true);
    expect(result.data.deployId).toBe("older");
    expect(result.data.url).toBe("https://my-site.freecode.camp");
  });

  it("throws UsageError when --to is missing", async () => {
    const deps = mkSdkDeps();
    await expect(
      drive(staticRollback({ to: undefined }, deps), autoReject, () => {}),
    ).rejects.toThrow(/--to/i);
  });

  it("throws CredentialError when identity chain returns null", async () => {
    const deps = mkSdkDeps({ resolveIdentity: vi.fn().mockResolvedValue(null) });
    await expect(
      drive(staticRollback({ to: "x" }, deps), autoReject, () => {}),
    ).rejects.toThrow(/login|identity/i);
  });

  describe("409 alias_drift handling", () => {
    it("yields confirm on drift; if rejected, throws AliasDriftError", async () => {
      const proxy = mkProxy();
      proxy.siteRollback.mockRejectedValueOnce(new AliasDriftError("drift", "newer-id"));
      const deps = mkSdkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
      await expect(
        drive(staticRollback({ to: "older" }, deps), autoReject, () => {}),
      ).rejects.toThrow(AliasDriftError);
      expect(proxy.siteRollback).toHaveBeenCalledTimes(1);
    });

    it("retries on drift when confirm accepted", async () => {
      const proxy = mkProxy();
      proxy.siteRollback
        .mockRejectedValueOnce(new AliasDriftError("drift", "newer-id"))
        .mockResolvedValueOnce({ url: "https://my-site.freecode.camp", deployId: "older" });
      const deps = mkSdkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
      const result = await drive(staticRollback({ to: "older" }, deps), autoAccept, () => {});
      expect(proxy.siteRollback).toHaveBeenCalledTimes(2);
      expect(proxy.siteRollback).toHaveBeenNthCalledWith(2, {
        site: "my-site",
        to: "older",
        expectedCurrent: "newer-id",
      });
      expect(result.data.success).toBe(true);
    });
  });
});

describe("staticRollbackHandler", () => {
  function mkHandlerDeps(overrides: Record<string, unknown> = {}) {
    return {
      ...mkSdkDeps(),
      logSuccess: vi.fn(),
      logError: vi.fn(),
      exit: vi.fn().mockImplementation((_code: number) => {
        throw new Error("__exit__");
      }),
      ...overrides,
    };
  }

  it("emits success envelope in JSON mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    const deps = mkHandlerDeps();
    await staticRollbackHandler({ json: true, to: "older" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("rollback");
    expect(env.success).toBe(true);
    expect(env.deployId).toBe("older");
  });

  it("errors with EXIT_USAGE when --to is missing", async () => {
    const deps = mkHandlerDeps();
    await expect(staticRollbackHandler({ json: false, to: undefined }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
  });

  it("propagates 422 deploy_missing as EXIT_STORAGE", async () => {
    const proxy = mkProxy();
    proxy.siteRollback.mockRejectedValue(
      new ProxyError(422, "deploy_missing", "target deploy no longer exists in r2"),
    );
    const deps = mkHandlerDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(staticRollbackHandler({ json: false, to: "ancient" }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(13);
  });

  describe("409 alias_drift handling", () => {
    it("JSON mode emits envelope with top-level current field, no retry", async () => {
      const proxy = mkProxy();
      proxy.siteRollback.mockRejectedValueOnce(new AliasDriftError("drift", "newer-id"));
      const deps = mkHandlerDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
      const stdout: string[] = [];
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });
      await expect(staticRollbackHandler({ json: true, to: "older" }, deps)).rejects.toThrow("__exit__");
      spy.mockRestore();
      const env = JSON.parse(stdout.join("").trim());
      expect(env.success).toBe(false);
      expect(env.current).toBe("newer-id");
      expect(proxy.siteRollback).toHaveBeenCalledTimes(1);
    });

  });
});
