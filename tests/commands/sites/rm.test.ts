import { describe, expect, it, vi } from "vitest";
import { rm } from "../../../src/commands/sites/rm.js";

function mkProxy() {
  return {
    whoami: vi.fn(),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    deployFinalize: vi.fn(),
    siteDeploys: vi.fn(),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
    registerSite: vi.fn(),
    listSites: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn().mockResolvedValue(undefined),
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

describe("sites rm command", () => {
  it("calls deleteSite with slug", async () => {
    const deps = mkDeps();
    await rm({ json: false, slug: "blog" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.deleteSite).toHaveBeenCalledWith({ slug: "blog" });
  });

  it("rejects empty slug with EXIT_USAGE", async () => {
    const deps = mkDeps();
    await expect(rm({ json: false, slug: "" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(
      10,
      expect.stringMatching(/slug is required/i),
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
    await rm({ json: true, slug: "blog" }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("sites rm");
    expect(env.success).toBe(true);
    expect(env.slug).toBe("blog");
    expect(env.deleted).toBe(true);
  });

  it("maps proxy 404 not_found to surfaced code", async () => {
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = mkProxy();
    proxy.deleteSite = vi
      .fn()
      .mockRejectedValue(
        new ProxyError(404, "not_found", "site is not registered"),
      );
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(rm({ json: false, slug: "ghost" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(
      10,
      expect.stringContaining("not_found"),
    );
  });

  it("maps proxy 403 user_unauthorized to EXIT_CREDENTIALS", async () => {
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = mkProxy();
    proxy.deleteSite = vi
      .fn()
      .mockRejectedValue(
        new ProxyError(403, "user_unauthorized", "not on staff team"),
      );
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(rm({ json: false, slug: "blog" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(
      12,
      expect.stringContaining("user_unauthorized"),
    );
  });
});
