import { describe, expect, it, vi } from "vitest";
import { update } from "../../../src/commands/sites/update.js";

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
    updateSite: vi.fn().mockResolvedValue({
      slug: "blog",
      teams: ["news-editors", "platform"],
      createdAt: "2026-05-10T00:00:00Z",
      updatedAt: "2026-05-11T00:00:00Z",
      createdBy: "alice",
    }),
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

describe("sites update command", () => {
  it("calls updateSite with slug + parsed teams", async () => {
    const deps = mkDeps();
    await update(
      { json: false, slug: "blog", team: "news-editors,platform" },
      deps,
    );
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.updateSite).toHaveBeenCalledWith({
      slug: "blog",
      teams: ["news-editors", "platform"],
    });
  });

  it("rejects empty slug with EXIT_USAGE", async () => {
    const deps = mkDeps();
    await expect(
      update({ json: false, slug: "", team: "staff" }, deps),
    ).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringMatching(/slug is required/i),
    );
  });

  it("rejects missing --team with EXIT_USAGE (server enforces too)", async () => {
    const deps = mkDeps();
    await expect(update({ json: false, slug: "blog" }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringMatching(/--team is required/i),
    );
  });

  it("rejects empty --team string with EXIT_USAGE", async () => {
    const deps = mkDeps();
    await expect(
      update({ json: false, slug: "blog", team: "" }, deps),
    ).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringMatching(/--team is required/i),
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
    await update(
      { json: true, slug: "blog", team: "news-editors,platform" },
      deps,
    );
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("sites update");
    expect(env.success).toBe(true);
    expect(env.slug).toBe("blog");
    expect(env.teams).toEqual(["news-editors", "platform"]);
  });

  it("maps proxy 404 not_found to surfaced code", async () => {
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = mkProxy();
    proxy.updateSite = vi
      .fn()
      .mockRejectedValue(
        new ProxyError(404, "not_found", "site is not registered"),
      );
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(
      update({ json: false, slug: "ghost", team: "staff" }, deps),
    ).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringContaining("not_found"),
    );
  });
});
