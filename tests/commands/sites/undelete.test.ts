import { describe, expect, it, vi } from "vitest";
import { undelete } from "../../../src/commands/sites/undelete.js";

function mkProxy() {
  return {
    undeleteSite: vi.fn().mockResolvedValue({
      slug: "blog",
      prevProduction: "20260827-140000-newsha",
      prevPreview: "20260801-090000-oldsha",
    }),
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
    ...overrides,
  };
}

describe("sites undelete command", () => {
  it("calls undeleteSite with the slug", async () => {
    const deps = mkDeps();
    await undelete({ json: false, slug: "blog" }, deps);
    const proxy = deps.createProxyClient.mock.results[0]?.value;
    expect(proxy.undeleteSite).toHaveBeenCalledWith({ slug: "blog" });
  });

  it("prints both alias pointers", async () => {
    const deps = mkDeps();
    await undelete({ json: false, slug: "blog" }, deps);
    const printed = deps.logSuccess.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(printed).toContain("20260827-140000-newsha");
    expect(printed).toContain("20260801-090000-oldsha");
  });

  it("rejects an empty slug with EXIT_USAGE", async () => {
    const deps = mkDeps();
    await expect(undelete({ json: false, slug: "" }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(10);
  });

  it("emits the pointers in the JSON envelope", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    const deps = mkDeps();
    await undelete({ json: true, slug: "blog" }, deps);
    writeSpy.mockRestore();
    const env = JSON.parse(stdout.join(""));
    expect(env.prevProduction).toBe("20260827-140000-newsha");
    expect(env.prevPreview).toBe("20260801-090000-oldsha");
  });
});

describe("sites undelete on a 404", () => {
  it("names the causes that can actually occur and points at the list", async () => {
    const { ProxyError } = await import("../../../src/lib/proxy-client.js");
    const proxy = {
      undeleteSite: vi.fn().mockRejectedValue(new ProxyError(404, "http_404", "Not Found")),
    };
    const deps = mkDeps({ createProxyClient: vi.fn().mockReturnValue(proxy) });
    await expect(undelete({ json: false, slug: "blog" }, deps)).rejects.toThrow("__exit__");
    const msg = deps.logError.mock.calls[0]?.[0] as string;
    expect(msg).toMatch(/expired/i);
    expect(msg).toMatch(/sites ls --held/);
    expect(msg).not.toMatch(/predate/i);
  });
});
