import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { run } from "../src/cli.js";

vi.mock("../src/output/format.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/output/format.js")
  >("../src/output/format.js");
  return {
    ...actual,
    outputError: vi.fn(),
  };
});
vi.mock("../src/output/exit-codes.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/output/exit-codes.js")
  >("../src/output/exit-codes.js");
  return {
    ...actual,
    exitWithCode: vi.fn(),
  };
});

import { outputError } from "../src/output/format.js";
import { exitWithCode } from "../src/output/exit-codes.js";

const mockOutputError = vi.mocked(outputError);
const mockExitWithCode = vi.mocked(exitWithCode);

describe("CLI module", () => {
  it("exports a run function", () => {
    expect(typeof run).toBe("function");
  });

  it("uses only static imports for command modules (SEA useCodeCache compat)", () => {
    const cliPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "cli.ts",
    );
    const source = readFileSync(cliPath, "utf8");
    expect(source).not.toMatch(/await\s+import\s*\(/);
  });
});

describe("top-level CLI", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let output: string;

  beforeEach(() => {
    output = "";
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((
      chunk: unknown,
    ) => {
      output += String(chunk);
      return true;
    }) as never);
    vi.spyOn(console, "log").mockImplementation(((...args: unknown[]) => {
      output += args.map(String).join(" ") + "\n";
    }) as never);
    vi.spyOn(console, "info").mockImplementation(((...args: unknown[]) => {
      output += args.map(String).join(" ") + "\n";
    }) as never);
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('--help shows "static" as a command', () => {
    run(["node", "universe", "--help"]);
    expect(output).toContain("static");
    expect(stdoutSpy).toBeDefined();
  });

  it("--version outputs package version", async () => {
    const pkg = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
        "utf8",
      ),
    );
    run(["node", "universe", "--version"]);
    expect(output).toContain(pkg.version);
  });
});

vi.mock("../src/commands/deploy.js", () => ({
  deploy: vi.fn(),
}));
vi.mock("../src/commands/promote.js", () => ({
  promote: vi.fn(),
}));
vi.mock("../src/commands/rollback.js", () => ({
  rollback: vi.fn(),
}));

import { deploy } from "../src/commands/deploy.js";
const mockDeploy = vi.mocked(deploy);

describe("top-level error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("catches errors from deploy action and routes through outputError", async () => {
    mockDeploy.mockRejectedValue(new Error("config file not found"));

    run(["node", "universe", "static", "deploy"]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "deploy" }),
      expect.any(Number),
      expect.stringContaining("config file not found"),
    );
    expect(mockExitWithCode).toHaveBeenCalled();
  });

  it("maps CliError subclasses to their declared exit code", async () => {
    const { ConfigError } = await import("../src/errors.js");
    const { EXIT_CONFIG, EXIT_USAGE } =
      await import("../src/output/exit-codes.js");
    mockDeploy.mockRejectedValue(new ConfigError("bad platform.yaml"));

    run(["node", "universe", "static", "deploy"]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockExitWithCode).toHaveBeenCalledWith(
      EXIT_CONFIG,
      "bad platform.yaml",
    );
    expect(mockExitWithCode).not.toHaveBeenCalledWith(
      EXIT_USAGE,
      expect.anything(),
    );
  });

  it("falls back to EXIT_USAGE for raw Error instances", async () => {
    const { EXIT_USAGE } = await import("../src/output/exit-codes.js");
    mockDeploy.mockRejectedValue(new Error("mystery failure"));

    run(["node", "universe", "static", "deploy"]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockExitWithCode).toHaveBeenCalledWith(
      EXIT_USAGE,
      "mystery failure",
    );
  });
});

describe("universe static namespace", () => {
  let output: string;

  beforeEach(() => {
    output = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      output += String(chunk);
      return true;
    }) as never);
    vi.spyOn(console, "log").mockImplementation(((...args: unknown[]) => {
      output += args.map(String).join(" ") + "\n";
    }) as never);
    vi.spyOn(console, "info").mockImplementation(((...args: unknown[]) => {
      output += args.map(String).join(" ") + "\n";
    }) as never);
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("static --help lists subcommands (deploy, promote, rollback)", () => {
    run(["node", "universe", "static", "--help"]);
    expect(output).toContain("deploy");
    expect(output).toContain("promote");
    expect(output).toContain("rollback");
  });

  it("static deploy --help shows deploy-specific options", () => {
    run(["node", "universe", "static", "deploy", "--help"]);
    expect(output).toContain("--json");
    expect(output).toContain("--force");
    expect(output).toContain("--output-dir");
  });
});
