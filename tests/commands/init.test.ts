import { describe, expect, it, vi } from "vitest";
import { init, initHandler, repoNameFromRemote, sanitizeSite } from "../../src/commands/init.js";
import type { Step, StepResponse } from "../../src/interaction/step.js";
import type { CommandResult } from "../../src/output/command-result.js";

function mkSdkDeps(overrides: Record<string, unknown> = {}) {
  const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
  enoent.code = "ENOENT";
  return {
    cwd: "/proj/my-cool-site",
    readFileText: vi.fn().mockRejectedValue(enoent),
    writeFileText: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(false),
    detectGitRemote: vi.fn().mockReturnValue(null),
    ...overrides,
  };
}

function writtenContent(deps: { writeFileText: ReturnType<typeof vi.fn> }): string {
  return (deps.writeFileText.mock.calls[0]?.[1] as string) ?? "";
}

async function drive(
  gen: AsyncGenerator<Step, CommandResult, StepResponse>,
  responses: Record<string, StepResponse> = {},
): Promise<{ steps: Step[]; result: CommandResult }> {
  const steps: Step[] = [];
  let next = await gen.next();
  while (!next.done) {
    const step = next.value;
    steps.push(step);
    const field = "field" in step ? step.field : undefined;
    const response = field && field in responses ? responses[field] : undefined;
    next = await gen.next(response);
  }
  return { steps, result: next.value };
}

describe("sanitizeSite", () => {
  it("lowercases and hyphenates invalid runs", () => {
    expect(sanitizeSite("My_Cool Site!!")).toBe("my-cool-site");
  });

  it("trims leading/trailing hyphens and collapses repeats", () => {
    expect(sanitizeSite("--a--b--")).toBe("a-b");
  });

  it("returns empty string when nothing usable survives", () => {
    expect(sanitizeSite("___")).toBe("");
  });
});

describe("repoNameFromRemote", () => {
  it("parses ssh remotes", () => {
    expect(repoNameFromRemote("git@github.com:org/my-repo.git")).toBe("my-repo");
  });

  it("parses https remotes without .git", () => {
    expect(repoNameFromRemote("https://github.com/org/my-repo")).toBe("my-repo");
  });
});

describe("init SDK", () => {
  it("derives site from cwd basename when yes is set", async () => {
    const deps = mkSdkDeps();
    const { result } = await drive(init({ yes: true }, deps));
    expect(deps.writeFileText).toHaveBeenCalledTimes(1);
    expect(result.data.site).toBe("my-cool-site");
    expect(writtenContent(deps)).toContain("site: my-cool-site");
  });

  it("derives site from git remote over dir name", async () => {
    const deps = mkSdkDeps({
      detectGitRemote: vi.fn().mockReturnValue("git@github.com:freeCodeCamp-Universe/hello-world.git"),
    });
    const { result } = await drive(init({ yes: true }, deps));
    expect(result.data.site).toBe("hello-world");
  });

  it("--site overrides derived slug", async () => {
    const deps = mkSdkDeps();
    const { result } = await drive(init({ yes: true, site: "explicit-slug" }, deps));
    expect(result.data.site).toBe("explicit-slug");
  });

  it("yields text/confirm steps when yes is not set and no site provided", async () => {
    const deps = mkSdkDeps();
    const { steps, result } = await drive(init({}, deps), {
      site: "prompted-site",
      "want-build": false,
      "output-dir": "dist",
    });
    expect(steps.some((s) => s.type === "text" && "field" in s && s.field === "site")).toBe(true);
    expect(steps.some((s) => s.type === "confirm" && "field" in s && s.field === "want-build")).toBe(true);
    expect(result.data.site).toBe("prompted-site");
  });

  it("infers build command from package.json + lockfile in non-interactive mode", async () => {
    const deps = mkSdkDeps({
      readFileText: vi.fn().mockResolvedValue(JSON.stringify({ scripts: { build: "vite build" } })),
      pathExists: vi.fn().mockImplementation(async (p: string) => p.endsWith("pnpm-lock.yaml")),
    });
    await drive(init({ yes: true }, deps));
    expect(writtenContent(deps)).toContain("command: pnpm run build");
  });

  it("throws ConfigError when platform.yaml exists without --force", async () => {
    const deps = mkSdkDeps({
      pathExists: vi.fn().mockImplementation(async (p: string) => p.endsWith("platform.yaml")),
    });
    await expect(drive(init({ yes: true }, deps))).rejects.toThrow(/already exists/i);
  });

  it("overwrites with --force", async () => {
    const deps = mkSdkDeps({
      pathExists: vi.fn().mockImplementation(async (p: string) => p.endsWith("platform.yaml")),
    });
    await drive(init({ yes: true, force: true }, deps));
    expect(deps.writeFileText).toHaveBeenCalledTimes(1);
  });

  it("writes a schema-valid platform.yaml", async () => {
    const deps = mkSdkDeps({
      readFileText: vi.fn().mockResolvedValue(JSON.stringify({ scripts: { build: "vite build" } })),
      pathExists: vi.fn().mockImplementation(async (p: string) => p.endsWith("yarn.lock")),
    });
    await drive(init({ yes: true, site: "valid-site" }, deps));
    const { parsePlatformYaml } = await import("../../src/lib/platform-yaml.js");
    const result = parsePlatformYaml(writtenContent(deps));
    expect(result.ok).toBe(true);
  });
});

describe("initHandler", () => {
  function mkHandlerDeps(overrides: Record<string, unknown> = {}) {
    return {
      ...mkSdkDeps(),
      isTTY: false,
      logSuccess: vi.fn(),
      logInfo: vi.fn(),
      logError: vi.fn(),
      exit: vi.fn().mockImplementation((_code: number) => {
        throw new Error("__exit__");
      }),
      ...overrides,
    };
  }

  it("emits JSON envelope", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    const deps = mkHandlerDeps();
    await initHandler({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("init");
    expect(env.success).toBe(true);
    expect(env.site).toBe("my-cool-site");
    expect(env.path).toBe("/proj/my-cool-site/platform.yaml");
  });

  it("refuses to overwrite without --force (EXIT_CONFIG)", async () => {
    const deps = mkHandlerDeps({
      pathExists: vi.fn().mockImplementation(async (p: string) => p.endsWith("platform.yaml")),
    });
    await expect(initHandler({ json: false, yes: true }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(11);
  });

  it("includes build.output when --dir set", async () => {
    const deps = mkHandlerDeps();
    await initHandler({ json: false, yes: true, dir: "public" }, deps);
    expect(writtenContent(deps)).toContain("output: public");
  });

  it("calls logInfo in non-interactive mode", async () => {
    const deps = mkHandlerDeps();
    await initHandler({ json: false, yes: true }, deps);
    expect(deps.logInfo).toHaveBeenCalledWith(expect.stringContaining("Wrote platform.yaml"));
  });
});
