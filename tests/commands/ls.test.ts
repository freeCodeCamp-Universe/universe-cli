import { describe, expect, it, vi } from "vitest";
import { ls } from "../../src/commands/ls.js";

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
    siteDeploys: vi
      .fn()
      .mockResolvedValue([
        { deployId: "20260427-141522-abc1234" },
        { deployId: "20260426-101005-def5678" },
      ]),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
  };
}

interface FakeDeps {
  cwd: string;
  env: NodeJS.ProcessEnv;
  readPlatformYaml: ReturnType<typeof vi.fn>;
  resolveIdentity: ReturnType<typeof vi.fn>;
  createProxyClient: ReturnType<typeof vi.fn>;
  logSuccess: ReturnType<typeof vi.fn>;
  logInfo: ReturnType<typeof vi.fn>;
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
    logInfo: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

describe("ls command", () => {
  it("calls siteDeploys with site from platform.yaml", async () => {
    const deps = mkDeps();
    await ls({ json: false }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
      typeof mkProxy
    >;
    expect(proxy.siteDeploys).toHaveBeenCalledWith({ site: "my-site" });
  });

  it("--site flag overrides platform.yaml site", async () => {
    const deps = mkDeps();
    await ls({ json: false, site: "other-site" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
      typeof mkProxy
    >;
    expect(proxy.siteDeploys).toHaveBeenCalledWith({ site: "other-site" });
  });

  it("works without platform.yaml when --site provided", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    const deps = mkDeps({
      readPlatformYaml: vi.fn().mockRejectedValue(err),
    });
    await ls({ json: false, site: "explicit-site" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value as ReturnType<
      typeof mkProxy
    >;
    expect(proxy.siteDeploys).toHaveBeenCalledWith({ site: "explicit-site" });
  });

  it("emits JSON envelope with parsed deploys", async () => {
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
    expect(env.command).toBe("ls");
    expect(env.success).toBe(true);
    expect(env.site).toBe("my-site");
    expect(env.deploys).toEqual([
      {
        deployId: "20260427-141522-abc1234",
        timestamp: "2026-04-27T14:15:22Z",
        sha: "abc1234",
      },
      {
        deployId: "20260426-101005-def5678",
        timestamp: "2026-04-26T10:10:05Z",
        sha: "def5678",
      },
    ]);
  });

  it("prints table header + rows in text mode", async () => {
    const deps = mkDeps();
    await ls({ json: false }, deps);
    const msg = deps.logSuccess.mock.calls[0]?.[0] ?? "";
    expect(msg).toContain("DEPLOY ID");
    expect(msg).toContain("TIMESTAMP");
    expect(msg).toContain("SHA");
    expect(msg).toContain("20260427-141522-abc1234");
    expect(msg).toContain("abc1234");
  });

  it("reports empty list cleanly in text mode", async () => {
    const proxy = mkProxy();
    proxy.siteDeploys.mockResolvedValue([]);
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await ls({ json: false }, deps);
    const all = [
      ...deps.logInfo.mock.calls.map((c) => c[0]),
      ...deps.logSuccess.mock.calls.map((c) => c[0]),
    ].join("\n");
    expect(all.toLowerCase()).toContain("no deploys");
  });

  it("errors with EXIT_CREDENTIALS when identity null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(ls({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(
      12,
      expect.stringMatching(/login|identity/i),
    );
  });

  it("errors with EXIT_CONFIG when no platform.yaml AND no --site", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    const deps = mkDeps({
      readPlatformYaml: vi.fn().mockRejectedValue(err),
    });
    await expect(ls({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(
      11,
      expect.stringMatching(/site|platform\.yaml/i),
    );
  });

  it("falls back to deployId-only row when format unparseable", async () => {
    const proxy = mkProxy();
    proxy.siteDeploys.mockResolvedValue([{ deployId: "weird-id" }]);
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });

    const stdout: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });
    await ls({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.deploys[0]).toEqual({
      deployId: "weird-id",
      timestamp: null,
      sha: null,
    });
  });
});
