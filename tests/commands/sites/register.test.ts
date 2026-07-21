import { describe, expect, it, vi } from "vitest";
import { register } from "../../../src/commands/sites/register.js";

function mkProxy() {
  return {
    whoami: vi.fn(),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    deployFinalize: vi.fn(),
    siteDeploys: vi.fn(),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
    registerSite: vi.fn().mockResolvedValue({
      slug: "blog",
      teams: ["staff"],
      createdAt: "2026-05-10T00:00:00Z",
      updatedAt: "2026-05-10T00:00:00Z",
      createdBy: "alice",
    }),
    listSites: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
  };
}

function mkDeps(overrides: Record<string, unknown> = {}) {
  return {
    env: {} as NodeJS.ProcessEnv,
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

describe("sites register command", () => {
  it("calls registerSite with slug + parsed teams", async () => {
    const deps = mkDeps();
    await register({ json: false, slug: "blog", team: "staff,news" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.registerSite).toHaveBeenCalledWith({
      slug: "blog",
      teams: ["staff", "news"],
    });
  });

  it("omits teams when --team flag absent (server applies default)", async () => {
    const deps = mkDeps();
    await register({ json: false, slug: "blog" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.registerSite).toHaveBeenCalledWith({
      slug: "blog",
      teams: undefined,
    });
  });

  it("emits success envelope in JSON mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    const deps = mkDeps();
    await register({ json: true, slug: "blog", team: "staff" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("sites register");
    expect(env.success).toBe(true);
    expect(env.slug).toBe("blog");
    expect(env.teams).toEqual(["staff"]);
    expect(env.createdBy).toBe("alice");
    // identitySource is carried through to JSON envelope for parity
    // with whoami/ls/deploy/promote/rollback.
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("rejects empty slug with EXIT_USAGE", async () => {
    const deps = mkDeps();
    await expect(register({ json: false, slug: "" }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/slug is required/i));
  });

  it("errors with EXIT_CREDENTIALS when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(register({ json: false, slug: "blog" }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(12);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/login|identity/i));
  });

  it("maps proxy 409 already_exists to EXIT_USAGE with surfaced code", async () => {
    const proxy = mkProxy();
    proxy.registerSite = vi.fn().mockRejectedValue(
      Object.assign(new Error("site is already registered"), {
        status: 409,
        code: "already_exists",
        exitCode: 10,
        constructor: { name: "ProxyError" },
      }),
    );
    // Use the actual ProxyError class so wrapProxyError detects it.
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    proxy.registerSite = vi
      .fn()
      .mockRejectedValue(new ProxyError(409, "already_exists", "site is already registered"));
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(register({ json: false, slug: "blog" }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining("already_exists"));
  });
});
