import { describe, expect, it, vi } from "vitest";
import { promote } from "../../src/commands/promote.js";
import { ProxyError } from "../../src/lib/proxy-client.js";

const VALID_YAML = "site: my-site\n";

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
    whoami: vi.fn(),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    deployFinalize: vi.fn(),
    siteDeploys: vi.fn(),
    sitePromote: vi.fn().mockResolvedValue({
      url: "https://my-site.freecode.camp",
      deployId: "20260427-abc",
    }),
    siteRollback: vi.fn().mockResolvedValue({
      url: "https://my-site.freecode.camp",
      deployId: "older-deploy",
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
    ...overrides,
  };
}

describe("promote command", () => {
  it("calls sitePromote with site from platform.yaml", async () => {
    const deps = mkDeps();
    await promote({ json: false }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
      typeof mkProxy
    >;
    expect(proxy.sitePromote).toHaveBeenCalledWith({ site: "my-site" });
    expect(proxy.siteRollback).not.toHaveBeenCalled();
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
    await promote({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("promote");
    expect(env.success).toBe(true);
    expect(env.deployId).toBe("20260427-abc");
    expect(env.url).toBe("https://my-site.freecode.camp");
  });

  it("--from flag routes through siteRollback (alias rewrite)", async () => {
    const deps = mkDeps();
    await promote({ json: false, from: "older-deploy" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
      typeof mkProxy
    >;
    expect(proxy.siteRollback).toHaveBeenCalledWith({
      site: "my-site",
      to: "older-deploy",
    });
    expect(proxy.sitePromote).not.toHaveBeenCalled();
  });

  it("errors with EXIT_CREDENTIALS when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(promote({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(
      12,
      expect.stringMatching(/login|identity/i),
    );
  });

  it("errors with EXIT_CONFIG when platform.yaml missing", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    const deps = mkDeps({
      readPlatformYaml: vi.fn().mockRejectedValue(err),
    });
    await expect(promote({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(
      11,
      expect.stringMatching(/platform\.yaml/i),
    );
  });

  it("propagates 422 no_preview as EXIT_STORAGE", async () => {
    const proxy = mkProxy();
    proxy.sitePromote.mockRejectedValue(
      new ProxyError(422, "no_preview", "no preview alias to promote"),
    );
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(promote({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(
      13,
      expect.stringContaining("no preview alias"),
    );
  });

  it("propagates 403 site_unauthorized as EXIT_CREDENTIALS", async () => {
    const proxy = mkProxy();
    proxy.sitePromote.mockRejectedValue(
      new ProxyError(403, "user_unauthorized", "no team"),
    );
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(promote({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(
      12,
      expect.stringContaining("no team"),
    );
  });
});
