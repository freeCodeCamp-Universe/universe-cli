import { describe, expect, it, vi } from "vitest";
import { list } from "../../../src/commands/sites/list.js";

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
    exit: vi.fn((_code: number): never => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

describe("sites list command", () => {
  it("calls listSites and emits text table", async () => {
    const deps = mkDeps();
    await list({ json: false }, deps);
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
    await list({ json: false }, deps);
    expect(deps.logSuccess).toHaveBeenCalledWith("No registered sites.");
  });

  it("emits envelope with count + sites in JSON mode", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    const deps = mkDeps();
    await list({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("sites list");
    expect(env.success).toBe(true);
    expect(env.count).toBe(2);
    expect(env.sites).toEqual(ROWS);
    // identitySource is carried through to JSON envelope for parity
    // with whoami/deploy/promote/rollback.
    expect(env.identitySource).toBe("env_GITHUB_TOKEN");
  });

  it("errors with EXIT_CREDENTIALS when identity chain returns null", async () => {
    const deps = mkDeps({
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(list({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(12);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/login|identity/i));
  });

  it("maps proxy 502 registry_read_failed to EXIT_STORAGE", async () => {
    const { ProxyError } = await import("@freecodecamp/universe-core");
    const proxy = mkProxy();
    proxy.listSites = vi
      .fn()
      .mockRejectedValue(new ProxyError(502, "registry_read_failed", "valkey down"));
    const deps = mkDeps({
      createProxyClient: vi.fn().mockReturnValue(proxy),
    });
    await expect(list({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(13);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining("registry_read_failed"));
  });
});

describe("sites list --held", () => {
  it("asks the server for reserved rows", async () => {
    const proxy = {
      listSites: vi.fn().mockResolvedValue([]),
    };
    const deps = {
      env: {} as NodeJS.ProcessEnv,
      resolveIdentity: vi.fn().mockResolvedValue({ token: "ghp_x", source: "env_GITHUB_TOKEN" }),
      createProxyClient: vi.fn().mockReturnValue(proxy),
      logSuccess: vi.fn(),
      logError: vi.fn(),
      exit: vi.fn((_c: number): never => {
        throw new Error("__exit__");
      }),
    };
    await list({ json: false, held: true }, deps);
    expect(proxy.listSites).toHaveBeenCalledWith({ state: "reserved" });
  });

  it("omits the query when not asking for held names, so 1.9.1 still answers", async () => {
    const proxy = { listSites: vi.fn().mockResolvedValue([]) };
    const deps = {
      env: {} as NodeJS.ProcessEnv,
      resolveIdentity: vi.fn().mockResolvedValue({ token: "ghp_x", source: "env_GITHUB_TOKEN" }),
      createProxyClient: vi.fn().mockReturnValue(proxy),
      logSuccess: vi.fn(),
      logError: vi.fn(),
      exit: vi.fn((_c: number): never => {
        throw new Error("__exit__");
      }),
    };
    await list({ json: false }, deps);
    expect(proxy.listSites).toHaveBeenCalledWith(undefined);
  });
});

describe("sites list --held against a pre-1.10.2 artemis", () => {
  function heldDeps(rows: unknown[]) {
    const proxy = { listSites: vi.fn().mockResolvedValue(rows), whoami: vi.fn() };
    return {
      proxy,
      deps: {
        env: {} as NodeJS.ProcessEnv,
        resolveIdentity: vi.fn().mockResolvedValue({ token: "ghp_x", source: "env_GITHUB_TOKEN" }),
        createProxyClient: vi.fn().mockReturnValue(proxy),
        logSuccess: vi.fn(),
        logError: vi.fn(),
        exit: vi.fn((_c: number): never => {
          throw new Error("__exit__");
        }),
      },
    };
  }

  it("refuses rather than presenting the whole active registry as held", async () => {
    const { deps } = heldDeps([
      { slug: "alpha", teams: ["staff"], createdAt: "t", updatedAt: "t", createdBy: "alice" },
    ]);
    await expect(list({ json: false, held: true }, deps)).rejects.toThrow("__exit__");
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/1\.10\.2|does not support/i));
  });

  it("an empty answer is unambiguous on every version, because none can answer empty while withholding held names", async () => {
    const { deps } = heldDeps([]);
    await list({ json: false, held: true }, deps);
    expect(deps.exit).not.toHaveBeenCalled();
    expect(deps.logSuccess).toHaveBeenCalledWith("No names are held by a delete.");
  });

  it("rejects --held with --mine before it resolves an identity", async () => {
    const { deps } = heldDeps([]);
    deps.resolveIdentity = vi.fn().mockRejectedValue(new Error("no token found"));
    await expect(list({ json: false, held: true, mine: true }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
    expect(deps.resolveIdentity).not.toHaveBeenCalled();
  });

  it("rejects --held with --mine, which the snapshot can never answer", async () => {
    const { deps } = heldDeps([]);
    await expect(list({ json: false, held: true, mine: true }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
  });
});

describe("sites list --held against artemis 1.10.0 and 1.10.1", () => {
  function mk(rows: unknown[]) {
    const proxy = { listSites: vi.fn().mockResolvedValue(rows), whoami: vi.fn() };
    return {
      proxy,
      deps: {
        env: {} as NodeJS.ProcessEnv,
        resolveIdentity: vi.fn().mockResolvedValue({ token: "ghp_x", source: "env_GITHUB_TOKEN" }),
        createProxyClient: vi.fn().mockReturnValue(proxy),
        logSuccess: vi.fn(),
        logError: vi.fn(),
        exit: vi.fn((_c: number): never => {
          throw new Error("__exit__");
        }),
      },
    };
  }

  it("refuses when the server carries state but did not honour the filter", async () => {
    const { deps } = mk([
      {
        slug: "alpha",
        teams: ["staff"],
        createdAt: "t",
        updatedAt: "t",
        createdBy: "a",
        state: "active",
      },
      {
        slug: "held",
        teams: ["staff"],
        createdAt: "t",
        updatedAt: "t",
        createdBy: "a",
        state: "reserved",
      },
    ]);
    await expect(list({ json: false, held: true }, deps)).rejects.toThrow("__exit__");
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/did not filter|1\.10\.2/i));
  });

  it("accepts a response where every row is reserved", async () => {
    const { deps } = mk([
      {
        slug: "held",
        teams: ["staff"],
        createdAt: "t",
        updatedAt: "t",
        createdBy: "a",
        state: "reserved",
      },
    ]);
    await list({ json: false, held: true }, deps);
    expect(deps.exit).not.toHaveBeenCalled();
  });

  it("renders a plain list of active sites byte-identically to a pre-1.10.0 server", async () => {
    const base = {
      slug: "alpha",
      teams: ["staff"],
      createdAt: "t",
      updatedAt: "t",
      createdBy: "a",
    };

    const legacy = mk([base]);
    await list({ json: false }, legacy.deps);
    const legacyOut = legacy.deps.logSuccess.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("\n");

    const modern = mk([{ ...base, state: "active" }]);
    await list({ json: false }, modern.deps);
    const modernOut = modern.deps.logSuccess.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("\n");

    expect(modernOut).toBe(legacyOut);
    expect(modernOut).not.toContain("STATE");
    expect(modernOut).not.toContain("HELD UNTIL");
  });
});
