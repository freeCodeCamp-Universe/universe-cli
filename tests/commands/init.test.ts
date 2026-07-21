import { describe, expect, it, vi } from "vitest";
import { init, repoNameFromRemote, sanitizeSite } from "../../src/commands/init.js";

interface FakeDeps {
  cwd: string;
  readFileText: ReturnType<typeof vi.fn>;
  writeFileText: ReturnType<typeof vi.fn>;
  pathExists: ReturnType<typeof vi.fn>;
  detectGitRemote: ReturnType<typeof vi.fn>;
  isTTY: boolean;
  promptText: ReturnType<typeof vi.fn>;
  promptConfirm: ReturnType<typeof vi.fn>;
  logSuccess: ReturnType<typeof vi.fn>;
  logInfo: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
}

function mkDeps(overrides: Partial<FakeDeps> = {}): FakeDeps {
  const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
  enoent.code = "ENOENT";
  return {
    cwd: "/proj/my-cool-site",
    readFileText: vi.fn().mockRejectedValue(enoent),
    writeFileText: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(false),
    detectGitRemote: vi.fn().mockReturnValue(null),
    isTTY: false,
    promptText: vi.fn(),
    promptConfirm: vi.fn(),
    logSuccess: vi.fn(),
    logInfo: vi.fn(),
    logError: vi.fn(),
    exit: vi.fn().mockImplementation((_code: number) => {
      throw new Error("__exit__");
    }),
    ...overrides,
  };
}

function writtenContent(deps: FakeDeps): string {
  return (deps.writeFileText.mock.calls[0]?.[1] as string) ?? "";
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

describe("init command", () => {
  it("derives site from cwd basename in non-interactive mode", async () => {
    const deps = mkDeps();
    await init({ json: false, yes: true }, deps);
    expect(deps.writeFileText).toHaveBeenCalledTimes(1);
    expect(deps.writeFileText.mock.calls[0]?.[0]).toBe("/proj/my-cool-site/platform.yaml");
    expect(writtenContent(deps)).toContain("site: my-cool-site");
  });

  it("derives site from the git remote over the dir name", async () => {
    const deps = mkDeps({
      detectGitRemote: vi
        .fn()
        .mockReturnValue("git@github.com:freeCodeCamp-Universe/hello-world.git"),
    });
    await init({ json: false, yes: true }, deps);
    expect(writtenContent(deps)).toContain("site: hello-world");
  });

  it("--site overrides the derived slug", async () => {
    const deps = mkDeps();
    await init({ json: false, yes: true, site: "explicit-slug" }, deps);
    expect(writtenContent(deps)).toContain("site: explicit-slug");
  });

  it("writes a site-only minimal file when no build script exists", async () => {
    const deps = mkDeps();
    await init({ json: false, yes: true }, deps);
    const content = writtenContent(deps);
    expect(content).toContain("site: my-cool-site");
    expect(content).not.toContain("build:");
  });

  it("infers the build command from package.json + lockfile", async () => {
    const deps = mkDeps({
      readFileText: vi.fn().mockResolvedValue(JSON.stringify({ scripts: { build: "vite build" } })),
      pathExists: vi.fn().mockImplementation(async (p: string) => p.endsWith("pnpm-lock.yaml")),
    });
    await init({ json: false, yes: true }, deps);
    const content = writtenContent(deps);
    expect(content).toContain("command: pnpm run build");
    expect(content).toContain("output: dist");
  });

  it("includes build.output when --dir set even without a build command", async () => {
    const deps = mkDeps();
    await init({ json: false, yes: true, dir: "public" }, deps);
    const content = writtenContent(deps);
    expect(content).toContain("output: public");
  });

  it("refuses to overwrite an existing platform.yaml without --force", async () => {
    const deps = mkDeps({
      pathExists: vi.fn().mockImplementation(async (p: string) => p.endsWith("platform.yaml")),
    });
    await expect(init({ json: false, yes: true }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(11);
    expect(deps.writeFileText).not.toHaveBeenCalled();
    expect(deps.logError).toHaveBeenCalledWith(expect.stringMatching(/already exists|--force/i));
  });

  it("overwrites with --force", async () => {
    const deps = mkDeps({
      pathExists: vi.fn().mockImplementation(async (p: string) => p.endsWith("platform.yaml")),
    });
    await init({ json: false, yes: true, force: true }, deps);
    expect(deps.writeFileText).toHaveBeenCalledTimes(1);
  });

  it("emits a JSON envelope", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    const deps = mkDeps();
    await init({ json: true }, deps);
    writeSpy.mockRestore();

    const env = JSON.parse(stdout.join("").trim());
    expect(env.command).toBe("init");
    expect(env.success).toBe(true);
    expect(env.site).toBe("my-cool-site");
    expect(env.path).toBe("/proj/my-cool-site/platform.yaml");
    expect(env.build).toBeNull();
  });

  it("runs prompts in interactive mode", async () => {
    const deps = mkDeps({
      isTTY: true,
      promptText: vi.fn().mockResolvedValueOnce("prompted-site").mockResolvedValueOnce("dist"),
      promptConfirm: vi.fn().mockResolvedValue(false),
    });
    await init({ json: false }, deps);
    expect(deps.promptText).toHaveBeenCalled();
    expect(writtenContent(deps)).toContain("site: prompted-site");
  });

  it("captures the build command from interactive prompts", async () => {
    const deps = mkDeps({
      isTTY: true,
      promptText: vi
        .fn()
        .mockResolvedValueOnce("my-site")
        .mockResolvedValueOnce("npm run build")
        .mockResolvedValueOnce("out"),
      promptConfirm: vi.fn().mockResolvedValue(true),
    });
    await init({ json: false }, deps);
    const content = writtenContent(deps);
    expect(content).toContain("command: npm run build");
    expect(content).toContain("output: out");
  });

  it("exits with EXIT_CONFIRM when an interactive prompt is cancelled", async () => {
    const { ConfirmError } = await import("../../src/errors.js");
    const deps = mkDeps({
      isTTY: true,
      promptText: vi.fn().mockRejectedValue(new ConfirmError("init cancelled")),
      promptConfirm: vi.fn(),
    });
    await expect(init({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(18);
    expect(deps.writeFileText).not.toHaveBeenCalled();
  });

  it("writes a schema-valid platform.yaml", async () => {
    const deps = mkDeps({
      readFileText: vi.fn().mockResolvedValue(JSON.stringify({ scripts: { build: "vite build" } })),
      pathExists: vi.fn().mockImplementation(async (p: string) => p.endsWith("yarn.lock")),
    });
    await init({ json: false, yes: true, site: "valid-site" }, deps);
    const { parsePlatformYaml } = await import("../../src/lib/platform-yaml.js");
    const result = parsePlatformYaml(writtenContent(deps));
    expect(result.ok).toBe(true);
  });
});
