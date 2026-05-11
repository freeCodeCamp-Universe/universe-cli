import { describe, expect, it, vi } from "vitest";
import { ls } from "../../../src/commands/sites/ls.js";

const ROWS = [
  {
    slug: "alpha",
    teams: ["staff"],
    createdAt: "2026-05-10T00:00:00Z",
    updatedAt: "2026-05-10T00:00:00Z",
    createdBy: "alice",
  },
  {
    slug: "beta",
    teams: ["news-editors", "platform"],
    createdAt: "2026-05-10T00:00:00Z",
    updatedAt: "2026-05-11T00:00:00Z",
    createdBy: "bob",
  },
];

function mkProxy(rows = ROWS) {
  return {
    whoami: vi.fn(),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    deployFinalize: vi.fn(),
    siteDeploys: vi.fn(),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
    registerSite: vi.fn(),
    listSites: vi.fn().mockResolvedValue(rows),
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

describe("sites ls command", () => {
  it("calls listSites and emits text table", async () => {
    const deps = mkDeps();
    await ls({ json: false }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.listSites).toHaveBeenCalledOnce();
    expect(deps.logSuccess).toHaveBeenCalledOnce();
    const tableArg = deps.logSuccess.mock.calls[0][0] as string;
    expect(tableArg).toContain("alpha");
    expect(tableArg).toContain("beta");
    expect(tableArg).toContain("staff");
    expect(tableArg).toContain("news-editors,platform");
  });

  it("renders 'No registered sites.' for empty list (text mode)", async () => {
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(mkProxy([])),
    });
    await ls({ json: false }, deps);
    expect(deps.logSuccess).toHaveBeenCalledWith("No registered sites.");
  });

  it("emits envelope with count + sites in JSON mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });

    const deps = mkDeps();
    await ls({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("sites ls");
    expect(env.success).toBe(true);
    expect(env.count).toBe(2);
    expect(env.sites).toEqual(ROWS);
  });

  it("errors with EXIT_CREDENTIALS when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(ls({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(12);
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringMatching(/login|identity/i),
    );
  });

  it("maps proxy 502 registry_read_failed to EXIT_STORAGE", async () => {
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = mkProxy();
    proxy.listSites = vi
      .fn()
      .mockRejectedValue(
        new ProxyError(502, "registry_read_failed", "valkey down"),
      );
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(ls({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(13);
    expect(deps.logError).toHaveBeenCalledWith(
      expect.stringContaining("registry_read_failed"),
    );
  });
});
