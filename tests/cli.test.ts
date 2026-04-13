import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { exitWithCode, EXIT_USAGE } from "../src/output/exit-codes.js";

const mockOutputError = vi.mocked(outputError);
const mockExitWithCode = vi.mocked(exitWithCode);

describe("CLI module", () => {
  it("exports a run function", () => {
    expect(typeof run).toBe("function");
  });
});

describe("top-level CLI", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('--help shows "static" as a command', () => {
    run(["node", "universe", "--help"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("static");
  });

  it("--version outputs package version", () => {
    run(["node", "universe", "--version"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("0.1.0");
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
});

describe("universe static namespace", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("static --help lists subcommands (deploy, promote, rollback)", () => {
    run(["node", "universe", "static", "--help"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("deploy");
    expect(output).toContain("promote");
    expect(output).toContain("rollback");
  });

  it("static deploy --help shows deploy-specific options", () => {
    run(["node", "universe", "static", "deploy", "--help"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("--json");
    expect(output).toContain("--force");
    expect(output).toContain("--output-dir");
  });
});
