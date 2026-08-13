import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { run, isVersionRequest } from "../src/cli.js";

vi.mock("../src/output/format.js", async () => {
  const actual =
    await vi.importActual<typeof import("../src/output/format.js")>("../src/output/format.js");
  return {
    ...actual,
    outputError: vi.fn(actual.outputError),
  };
});
vi.mock("../src/output/exit-codes.js", async () => {
  const actual = await vi.importActual<typeof import("../src/output/exit-codes.js")>(
    "../src/output/exit-codes.js",
  );
  return {
    ...actual,
    exitWithCode: vi.fn(),
  };
});

import { outputError } from "../src/output/format.js";
import { exitWithCode } from "../src/output/exit-codes.js";

const mockOutputError = vi.mocked(outputError);
const mockExitWithCode = vi.mocked(exitWithCode);

describe("isVersionRequest", () => {
  it("returns true for --version", () => {
    expect(isVersionRequest(["--version"])).toBe(true);
  });

  it("returns true for -v", () => {
    expect(isVersionRequest(["-v"])).toBe(true);
  });

  it("returns true when --version follows a namespace token", () => {
    expect(isVersionRequest(["static", "--version"])).toBe(true);
  });

  it("returns false for a normal command", () => {
    expect(isVersionRequest(["whoami"])).toBe(false);
  });
});

describe("CLI module", () => {
  it("exports a run function", () => {
    expect(typeof run).toBe("function");
  });

  it("uses only static imports for command modules (SEA useCodeCache compat)", () => {
    const cliPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts");
    const source = readFileSync(cliPath, "utf8");
    expect(source).not.toMatch(/await\s+import\s*\(/);
  });
});

describe("top-level CLI", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let output: string;

  beforeEach(() => {
    output = "";
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
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

  it("--help lists top-level auth commands (login, logout, whoami)", () => {
    run(["node", "universe", "--help"]);
    expect(output).toContain("login");
    expect(output).toContain("logout");
    expect(output).toContain("whoami");
  });

  it("login --help shows --json and --force options", () => {
    run(["node", "universe", "login", "--help"]);
    expect(output).toContain("--json");
    expect(output).toContain("--force");
  });

  it("logout --help shows --json option", () => {
    run(["node", "universe", "logout", "--help"]);
    expect(output).toContain("--json");
  });

  it("whoami --help shows --json option", () => {
    run(["node", "universe", "whoami", "--help"]);
    expect(output).toContain("--json");
  });

  it("--version outputs package version", async () => {
    const pkg = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    await run(["node", "universe", "--version"]);
    expect(output).toContain(pkg.version);
    vi.unstubAllGlobals();
  });
});

vi.mock("../src/commands/deploy.js", () => ({
  staticDeployHandler: vi.fn(),
}));
vi.mock("../src/commands/promote.js", () => ({
  staticPromoteHandler: vi.fn(),
}));
vi.mock("../src/commands/rollback.js", () => ({
  staticRollbackHandler: vi.fn(),
}));
vi.mock("../src/commands/login.js", () => ({
  loginHandler: vi.fn(),
}));
vi.mock("../src/commands/logout.js", () => ({
  logoutHandler: vi.fn(),
}));
vi.mock("../src/commands/whoami.js", () => ({
  whoamiHandler: vi.fn(),
}));
vi.mock("../src/commands/repo/create.js", () => ({ repoCreateHandler: vi.fn() }));
vi.mock("../src/commands/repo/ls.js", () => ({ repoLsHandler: vi.fn() }));
vi.mock("../src/commands/repo/approve.js", () => ({ repoApproveHandler: vi.fn() }));
vi.mock("../src/commands/repo/reject.js", () => ({ repoRejectHandler: vi.fn() }));
vi.mock("../src/commands/repo/status.js", () => ({ repoStatusHandler: vi.fn() }));

import { staticDeployHandler } from "../src/commands/deploy.js";
import { loginHandler } from "../src/commands/login.js";
import { logoutHandler } from "../src/commands/logout.js";
import { whoamiHandler } from "../src/commands/whoami.js";
import { repoCreateHandler } from "../src/commands/repo/create.js";
import { repoLsHandler } from "../src/commands/repo/ls.js";
import { repoApproveHandler } from "../src/commands/repo/approve.js";
const mockDeploy = vi.mocked(staticDeployHandler);
const mockLogin = vi.mocked(loginHandler);
const mockLogout = vi.mocked(logoutHandler);
const mockWhoami = vi.mocked(whoamiHandler);
const mockRepoCreate = vi.mocked(repoCreateHandler);
const mockRepoLs = vi.mocked(repoLsHandler);
const mockRepoApprove = vi.mocked(repoApproveHandler);

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
    const err = new Error("config file not found");
    mockDeploy.mockRejectedValue(err);

    run(["node", "universe", "static", "deploy"]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "deploy" }),
      err,
    );
    expect(mockExitWithCode).toHaveBeenCalled();
  });

  it("maps CliError subclasses to their declared exit code", async () => {
    const { ConfigError } = await import("../src/errors.js");
    const { EXIT_CONFIG, EXIT_USAGE } = await import("../src/output/exit-codes.js");
    const err = new ConfigError("bad platform.yaml");
    mockDeploy.mockRejectedValue(err);

    run(["node", "universe", "static", "deploy"]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockExitWithCode).toHaveBeenCalledWith(EXIT_CONFIG);
    expect(mockExitWithCode).not.toHaveBeenCalledWith(EXIT_USAGE);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "deploy" }),
      err,
    );
  });

  it("falls back to EXIT_USAGE for raw Error instances", async () => {
    const { EXIT_USAGE } = await import("../src/output/exit-codes.js");
    const err = new Error("mystery failure");
    mockDeploy.mockRejectedValue(err);

    run(["node", "universe", "static", "deploy"]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockExitWithCode).toHaveBeenCalledWith(EXIT_USAGE);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "deploy" }),
      err,
    );
  });

  it("invokes login command when 'universe login' runs", async () => {
    mockLogin.mockResolvedValue(undefined);
    run(["node", "universe", "login"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({ json: false }));
  });

  it("invokes logout command with --json flag forwarded", async () => {
    mockLogout.mockResolvedValue(undefined);
    run(["node", "universe", "logout", "--json"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockLogout).toHaveBeenCalledWith(expect.objectContaining({ json: true }));
  });

  it("invokes whoami command", async () => {
    mockWhoami.mockResolvedValue(undefined);
    run(["node", "universe", "whoami"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockWhoami).toHaveBeenCalledWith(expect.objectContaining({ json: false }));
  });

  it("login --force forwards force flag", async () => {
    mockLogin.mockResolvedValue(undefined);
    run(["node", "universe", "login", "--force"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
  });

  it("routes login errors through outputError + exit code map", async () => {
    const { ConfigError } = await import("../src/errors.js");
    const { EXIT_CONFIG } = await import("../src/output/exit-codes.js");
    const err = new ConfigError("missing client id");
    mockLogin.mockRejectedValue(err);

    run(["node", "universe", "login"]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockExitWithCode).toHaveBeenCalledWith(EXIT_CONFIG);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "login" }),
      err,
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

  it("static --help lists subcommands (deploy, promote, rollback, ls)", () => {
    run(["node", "universe", "static", "--help"]);
    expect(output).toContain("deploy");
    expect(output).toContain("promote");
    expect(output).toContain("rollback");
    expect(output).toContain("ls");
  });

  it("static deploy --help shows deploy-specific options", () => {
    run(["node", "universe", "static", "deploy", "--help"]);
    expect(output).toContain("--json");
    expect(output).toContain("--promote");
    expect(output).toContain("--dir");
  });

  it("global --json BEFORE 'static' still routes to staticCli (F6)", async () => {
    mockDeploy.mockResolvedValue(undefined);
    run(["node", "universe", "--json", "static", "deploy"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockDeploy).toHaveBeenCalledWith(expect.objectContaining({ json: true }));
  });

  it("flags AFTER 'static deploy' still parse correctly", async () => {
    mockDeploy.mockResolvedValue(undefined);
    run(["node", "universe", "static", "deploy", "--json", "--promote"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockDeploy).toHaveBeenCalledWith(expect.objectContaining({ json: true, promote: true }));
  });
});

describe("universe repo namespace", () => {
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

  it("repo --help lists subcommands (create, ls, approve, reject, status)", () => {
    run(["node", "universe", "repo", "--help"]);
    expect(output).toContain("create");
    expect(output).toContain("ls");
    expect(output).toContain("approve");
    expect(output).toContain("reject");
    expect(output).toContain("status");
  });

  it("repo create --help shows create-specific options", () => {
    run(["node", "universe", "repo", "create", "--help"]);
    expect(output).toContain("--visibility");
    expect(output).toContain("--template");
    expect(output).toContain("--yes");
  });

  it("global --json BEFORE 'repo' still routes to repoCli", async () => {
    mockRepoLs.mockResolvedValue(undefined);
    run(["node", "universe", "--json", "repo", "ls"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRepoLs).toHaveBeenCalledWith(expect.objectContaining({ json: true }));
  });

  it("repo create passes the positional name + flags", async () => {
    mockRepoCreate.mockResolvedValue(undefined);
    run([
      "node",
      "universe",
      "repo",
      "create",
      "learn-python-rpg",
      "--visibility",
      "public",
      "--yes",
    ]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRepoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "learn-python-rpg",
        visibility: "public",
        yes: true,
      }),
    );
  });

  it("repo approve passes the id positional", async () => {
    mockRepoApprove.mockResolvedValue(undefined);
    run(["node", "universe", "repo", "approve", "req_001", "--yes"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRepoApprove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req_001", yes: true }),
    );
  });

  it("repo approve missing <id> routes through outputError, no uncaught throw", async () => {
    const { EXIT_USAGE } = await import("../src/output/exit-codes.js");
    expect(() => run(["node", "universe", "repo", "approve"])).not.toThrow();
    expect(mockExitWithCode).toHaveBeenCalledWith(EXIT_USAGE);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "repo" }),
      EXIT_USAGE,
      expect.any(String),
    );
  });

  it("repo create unknown option routes through outputError, no throw", async () => {
    const { EXIT_USAGE } = await import("../src/output/exit-codes.js");
    expect(() =>
      run(["node", "universe", "repo", "create", "x", "--bogus", "--yes"]),
    ).not.toThrow();
    expect(mockExitWithCode).toHaveBeenCalledWith(EXIT_USAGE);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "repo", json: false }),
      EXIT_USAGE,
      expect.any(String),
    );
  });

  it("bare repo --json emits a JSON error envelope, not human help", async () => {
    const { EXIT_USAGE } = await import("../src/output/exit-codes.js");
    run(["node", "universe", "repo", "--json"]);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "repo", json: true }),
      EXIT_USAGE,
      expect.any(String),
    );
    expect(mockExitWithCode).toHaveBeenCalledWith(EXIT_USAGE);
  });
});
