import { describe, expect, it, vi } from "vitest";
import { staticPromote, staticPromoteHandler } from "../../src/commands/promote.js";
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
    getAlias: vi
      .fn()
      .mockImplementation(async (req: { site: string; mode: "preview" | "production" }) => {
        if (req.mode === "preview")
          return {
            url: "https://x.preview.freecode.camp",
            deployId: "PREV1",
          };
        return { url: "https://x.freecode.camp", deployId: "PROD1" };
      }),
    sitePromote: vi.fn().mockResolvedValue({
      url: "https://my-site.freecode.camp",
      deployId: "PREV1",
    }),
    siteRollback: vi.fn().mockResolvedValue({
      url: "https://my-site.freecode.camp",
      deployId: "older-deploy",
    }),
  };
}

interface SdkDeps {
  cwd: string;
  env: NodeJS.ProcessEnv;
  readPlatformYaml: ReturnType<typeof vi.fn>;
  resolveIdentity: ReturnType<typeof vi.fn>;
  createProxyClient: ReturnType<typeof vi.fn>;
}

function mkSdkDeps(overrides: Partial<SdkDeps> = {}): SdkDeps {
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

/** Auto-respond handler: reject confirms, ignore info/warning. */
const autoReject: (step: Step) => Promise<StepResponse> = async (step) =>
  step.type === "confirm" ? false : undefined;

/** Auto-respond handler: accept confirms. */
const autoAccept: (step: Step) => Promise<StepResponse> = async (step) =>
  step.type === "confirm" ? true : undefined;

describe("staticPromote SDK", () => {
  it("body-pins sitePromote with preview deployId + production expectedCurrent", async () => {
    const deps = mkSdkDeps();
    await drive(staticPromote({}, deps), autoReject, () => {});
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<typeof mkProxy>;
    expect(proxy.getAlias).toHaveBeenCalledWith({
      site: "my-site",
      mode: "preview",
    });
    expect(proxy.getAlias).toHaveBeenCalledWith({
      site: "my-site",
      mode: "production",
    });
    expect(proxy.sitePromote).toHaveBeenCalledWith({
      site: "my-site",
      deployId: "PREV1",
      expectedCurrent: "PROD1",
    });
    expect(proxy.siteRollback).not.toHaveBeenCalled();
  });

  it("sends empty expectedCurrent when production alias absent (first-promote)", async () => {
    const proxy = mkProxy();
    proxy.getAlias.mockImplementation(
      async (req: { site: string; mode: "preview" | "production" }) => {
        if (req.mode === "preview") return { url: "x", deployId: "PREV1" };
        return null;
      },
    );
    const deps = mkSdkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await drive(staticPromote({}, deps), autoReject, () => {});
    expect(proxy.sitePromote).toHaveBeenCalledWith({
      site: "my-site",
      deployId: "PREV1",
      expectedCurrent: "",
    });
  });

  it("throws ConfigError when preview alias absent (nothing to promote)", async () => {
    const proxy = mkProxy();
    proxy.getAlias.mockImplementation(
      async (req: { site: string; mode: "preview" | "production" }) => {
        if (req.mode === "preview") return null;
        return { url: "x", deployId: "PROD1" };
      },
    );
    const deps = mkSdkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(drive(staticPromote({}, deps), autoReject, () => {})).rejects.toThrow(
      /no preview/i,
    );
    expect(proxy.sitePromote).not.toHaveBeenCalled();
  });

  it("returns CommandResult with success envelope", async () => {
    const deps = mkSdkDeps();
    const result = await drive(staticPromote({}, deps), autoReject, () => {});
    expect(result.data.command).toBe("promote");
    expect(result.data.success).toBe(true);
    expect(result.data.deployId).toBe("PREV1");
    expect(result.data.url).toBe("https://my-site.freecode.camp");
    expect(result.data.site).toBe("my-site");
    expect(result.data.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("--from flag routes through siteRollback (alias rewrite)", async () => {
    const deps = mkSdkDeps();
    await drive(staticPromote({ from: "older-deploy" }, deps), autoReject, () => {});
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<typeof mkProxy>;
    expect(proxy.siteRollback).toHaveBeenCalledWith({
      site: "my-site",
      to: "older-deploy",
      expectedCurrent: "PROD1",
    });
    expect(proxy.sitePromote).not.toHaveBeenCalled();
  });

  it("--from result includes 'Preview alias unchanged.' in format", async () => {
    const deps = mkSdkDeps();
    const result = await drive(staticPromote({ from: "older-deploy" }, deps), autoReject, () => {});
    expect(result.format).toContain("Preview alias unchanged.");
  });

  it("throws CredentialError when identity chain returns null", async () => {
    const deps = mkSdkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(drive(staticPromote({}, deps), autoReject, () => {})).rejects.toThrow(
      /login|identity/i,
    );
  });

  it("throws ConfigError when platform.yaml missing", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    const deps = mkSdkDeps({
      readPlatformYaml: vi.fn().mockRejectedValue(err),
    });
    await expect(drive(staticPromote({}, deps), autoReject, () => {})).rejects.toThrow(
      /platform\.yaml/i,
    );
  });

  describe("409 alias_drift handling", () => {
    it("yields confirm on drift; if rejected, throws AliasDriftError", async () => {
      const proxy = mkProxy();
      proxy.sitePromote.mockRejectedValueOnce(new AliasDriftError("drift", "actual-prod-id"));
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      await expect(drive(staticPromote({}, deps), autoReject, () => {})).rejects.toThrow(
        AliasDriftError,
      );
      expect(proxy.sitePromote).toHaveBeenCalledTimes(1);
    });

    it("retries on drift when confirm accepted, re-pins expectedCurrent", async () => {
      const proxy = mkProxy();
      proxy.sitePromote
        .mockRejectedValueOnce(new AliasDriftError("drift", "actual-prod-id"))
        .mockResolvedValueOnce({
          url: "https://my-site.freecode.camp",
          deployId: "PREV1",
        });
      const deps = mkSdkDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const result = await drive(staticPromote({}, deps), autoAccept, () => {});
      expect(proxy.sitePromote).toHaveBeenCalledTimes(2);
      expect(proxy.sitePromote).toHaveBeenNthCalledWith(2, {
        site: "my-site",
        deployId: "PREV1",
        expectedCurrent: "actual-prod-id",
      });
      expect(result.data.success).toBe(true);
    });
  });
});

describe("staticPromoteHandler", () => {
  interface HandlerDeps extends SdkDeps {
    logSuccess: ReturnType<typeof vi.fn>;
    logError: ReturnType<typeof vi.fn>;
    exit: ReturnType<typeof vi.fn>;
  }

  function mkHandlerDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
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
    await staticPromoteHandler({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("promote");
    expect(env.success).toBe(true);
    expect(env.deployId).toBe("PREV1");
    expect(env.url).toBe("https://my-site.freecode.camp");
  });

  it("errors with EXIT_CREDENTIALS when identity chain returns null", async () => {
    const deps = mkHandlerDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(staticPromoteHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(12);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/login|identity/i));
  });

  it("errors with EXIT_CONFIG when platform.yaml missing", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    const deps = mkHandlerDeps({
      readPlatformYaml: vi.fn().mockRejectedValue(err),
    });
    await expect(staticPromoteHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(11);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/platform\.yaml/i));
  });

  it("propagates 422 no_preview as EXIT_STORAGE", async () => {
    const proxy = mkProxy();
    proxy.sitePromote.mockRejectedValue(
      new ProxyError(422, "no_preview", "no preview alias to promote"),
    );
    const deps = mkHandlerDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(staticPromoteHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(13);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining("no preview alias"));
  });

  it("surfaces 422 missing_index with the server hint as EXIT_STORAGE", async () => {
    const proxy = mkProxy();
    proxy.sitePromote.mockRejectedValue(
      new ProxyError(
        422,
        "missing_index",
        "target deploy has no root index.html; it cannot be served at /",
        undefined,
        "This looks like a framework build directory, not a static export.",
      ),
    );
    const deps = mkHandlerDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(staticPromoteHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(13);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining("missing_index"));
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringContaining("framework build directory"),
    );
  });

  it("propagates 403 site_unauthorized as EXIT_CREDENTIALS", async () => {
    const proxy = mkProxy();
    proxy.sitePromote.mockRejectedValue(new ProxyError(403, "user_unauthorized", "no team"));
    const deps = mkHandlerDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(staticPromoteHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(12);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining("no team"));
  });

  describe("409 alias_drift handling", () => {
    it("JSON mode emits envelope with top-level current field, no retry", async () => {
      const proxy = mkProxy();
      proxy.sitePromote.mockRejectedValueOnce(new AliasDriftError("drift", "actual-prod-id"));
      const deps = mkHandlerDeps({
        createProxyClient: vi.fn().mockReturnValue(proxy),
      });
      const stdout: string[] = [];
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });
      await expect(staticPromoteHandler({ json: true }, deps)).rejects.toThrow("__exit__");
      spy.mockRestore();
      const env = JSON.parse(stdout.join("").trim());
      expect(env.success).toBe(false);
      expect(env.current).toBe("actual-prod-id");
      expect((env.error as { message: string }).message).toContain("alias_drift");
      expect(deps.exit).toHaveBeenCalledWith(10);
      expect(proxy.sitePromote).toHaveBeenCalledTimes(1);
    });

  });
});
