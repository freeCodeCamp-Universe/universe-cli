import { describe, expect, it, vi } from "vitest";
import { release } from "../../../src/commands/sites/release.js";

function mkProxy() {
  return {
    releaseSite: vi.fn().mockResolvedValue({ slug: "blog", status: "released", moved: 42 }),
  };
}

function mkDeps(overrides: Record<string, unknown> = {}) {
  return {
    env: {} as NodeJS.ProcessEnv,
    resolveIdentity: vi.fn().mockResolvedValue({ token: "ghp_x", source: "env_GITHUB_TOKEN" }),
    createProxyClient: vi.fn().mockReturnValue(mkProxy()),
    logSuccess: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn((_code: number): never => {
      throw new Error("__exit__");
    }),
    confirm: vi.fn().mockResolvedValue(true),
    isTTY: true,
    ...overrides,
  };
}

describe("sites release command", () => {
  it("refuses without confirmation and never calls the server", async () => {
    const deps = mkDeps({ confirm: vi.fn().mockResolvedValue(false) });
    await expect(release({ json: false, slug: "blog", yes: false }, deps)).rejects.toThrow(
      "__exit__",
    );
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy?.releaseSite).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(18);
  });

  it("releases when confirmed", async () => {
    const deps = mkDeps();
    await release({ json: false, slug: "blog", yes: false }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.releaseSite).toHaveBeenCalledWith({ slug: "blog" });
  });

  it("--yes skips the prompt", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const deps = mkDeps({ confirm });
    await release({ json: false, slug: "blog", yes: true }, deps);
    expect(confirm).not.toHaveBeenCalled();
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.releaseSite).toHaveBeenCalledWith({ slug: "blog" });
  });

  it("rejects an empty slug with EXIT_USAGE", async () => {
    const deps = mkDeps();
    await expect(release({ json: false, slug: "", yes: true }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
  });
});

describe("sites release safety", () => {
  it("refuses a non-interactive session instead of hanging", async () => {
    const deps = mkDeps({ isTTY: false, confirm: undefined });
    await expect(release({ json: false, slug: "blog", yes: false }, deps)).rejects.toThrow(
      "__exit__",
    );
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy?.releaseSite).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(18);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/non-interactive/i));
  });

  it("--json without --yes refuses rather than prompting", async () => {
    const confirm = vi.fn();
    const deps = mkDeps({ confirm, isTTY: false });
    await expect(release({ json: true, slug: "blog", yes: false }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it("routes a declined confirm through the error envelope", async () => {
    const deps = mkDeps({ confirm: vi.fn().mockResolvedValue(false) });
    await expect(release({ json: false, slug: "blog", yes: false }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/cancelled/i));
  });
});

describe("sites release exit codes", () => {
  it("a missing --yes is EXIT_CONFIRM, matching docs/reference.md", async () => {
    const deps = mkDeps({ isTTY: false, confirm: undefined });
    await expect(release({ json: false, slug: "blog", yes: false }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(18);
  });

  it("--json without --yes is EXIT_CONFIRM too", async () => {
    const deps = mkDeps({ isTTY: true });
    await expect(release({ json: true, slug: "blog", yes: false }, deps)).rejects.toThrow(
      "__exit__",
    );
    expect(deps.exit).toHaveBeenCalledWith(18);
  });
});
