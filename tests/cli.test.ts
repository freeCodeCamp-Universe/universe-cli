import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { run, isVersionRequest } from "../src/cli.js";

vi.mock("../src/output/format.js", async () => {
  const actual =
    await vi.importActual<typeof import("../src/output/format.js")>("../src/output/format.js");
  return {
    ...actual,
    outputError: vi.fn(),
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
  let stdoutSpy: MockInstance;
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
  deploy: vi.fn(),
}));
vi.mock("../src/commands/promote.js", () => ({
  promote: vi.fn(),
}));
vi.mock("../src/commands/rollback.js", () => ({
  rollback: vi.fn(),
}));
vi.mock("../src/commands/sites/list.js", () => ({ list: vi.fn() }));
vi.mock("../src/commands/sites/release.js", () => ({ release: vi.fn() }));
vi.mock("../src/commands/login.js", () => ({
  login: vi.fn(),
}));
vi.mock("../src/commands/logout.js", () => ({
  logout: vi.fn(),
}));
vi.mock("../src/commands/whoami.js", () => ({
  whoami: vi.fn(),
}));
vi.mock("../src/commands/repo/create.js", () => ({ create: vi.fn() }));
vi.mock("../src/commands/repo/list.js", () => ({ list: vi.fn() }));
vi.mock("../src/commands/repo/approve.js", () => ({ approve: vi.fn() }));
vi.mock("../src/commands/repo/reject.js", () => ({ reject: vi.fn() }));
vi.mock("../src/commands/repo/status.js", () => ({ status: vi.fn() }));
vi.mock("../src/commands/list.js", () => ({ list: vi.fn() }));
vi.mock("../src/commands/audit/list.js", () => ({ list: vi.fn() }));
vi.mock("../src/commands/sites/remove.js", () => ({ remove: vi.fn() }));
vi.mock("../src/commands/repo/remove.js", () => ({ remove: vi.fn() }));

import { deploy } from "../src/commands/deploy.js";
import { login } from "../src/commands/login.js";
import { logout } from "../src/commands/logout.js";
import { whoami } from "../src/commands/whoami.js";
import { create as repoCreate } from "../src/commands/repo/create.js";
import { list as repoList } from "../src/commands/repo/list.js";
import { approve as repoApprove } from "../src/commands/repo/approve.js";
import { promote } from "../src/commands/promote.js";
import { list as sitesList } from "../src/commands/sites/list.js";
import { release as sitesRelease } from "../src/commands/sites/release.js";
import { list as staticList } from "../src/commands/list.js";
import { list as auditList } from "../src/commands/audit/list.js";
import { remove as sitesRemove } from "../src/commands/sites/remove.js";
import { remove as repoRemove } from "../src/commands/repo/remove.js";
const mockDeploy = vi.mocked(deploy);
const mockLogin = vi.mocked(login);
const mockLogout = vi.mocked(logout);
const mockWhoami = vi.mocked(whoami);
const mockRepoCreate = vi.mocked(repoCreate);
const mockRepoList = vi.mocked(repoList);
const mockRepoApprove = vi.mocked(repoApprove);
const mockPromote = vi.mocked(promote);
const mockSitesList = vi.mocked(sitesList);
const mockSitesRelease = vi.mocked(sitesRelease);
const mockStaticList = vi.mocked(staticList);
const mockAuditList = vi.mocked(auditList);
const mockSitesRemove = vi.mocked(sitesRemove);
const mockRepoRemove = vi.mocked(repoRemove);

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
    const { EXIT_CONFIG, EXIT_USAGE } = await import("../src/output/exit-codes.js");
    mockDeploy.mockRejectedValue(new ConfigError("bad platform.yaml"));

    run(["node", "universe", "static", "deploy"]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockExitWithCode).toHaveBeenCalledWith(EXIT_CONFIG);
    expect(mockExitWithCode).not.toHaveBeenCalledWith(EXIT_USAGE);
    // outputError carries the user-facing message; exitWithCode just exits.
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "deploy" }),
      EXIT_CONFIG,
      "bad platform.yaml",
    );
  });

  it("falls back to EXIT_USAGE for raw Error instances", async () => {
    const { EXIT_USAGE } = await import("../src/output/exit-codes.js");
    mockDeploy.mockRejectedValue(new Error("mystery failure"));

    run(["node", "universe", "static", "deploy"]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockExitWithCode).toHaveBeenCalledWith(EXIT_USAGE);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "deploy" }),
      EXIT_USAGE,
      "mystery failure",
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
    mockLogin.mockRejectedValue(new ConfigError("missing client id"));

    run(["node", "universe", "login"]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockExitWithCode).toHaveBeenCalledWith(EXIT_CONFIG);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "login" }),
      EXIT_CONFIG,
      "missing client id",
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

  it("static --help lists subcommands (deploy, promote, rollback, list)", () => {
    run(["node", "universe", "static", "--help"]);
    expect(output).toContain("deploy");
    expect(output).toContain("promote");
    expect(output).toContain("rollback");
    expect(output).toContain("list|ls");
  });

  it("static deploy --help shows deploy-specific options", () => {
    run(["node", "universe", "static", "deploy", "--help"]);
    expect(output).toContain("--json");
    expect(output).toContain("--promote");
    expect(output).toContain("--dir");
    expect(output).toContain("--no-reuse");
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

  it("maps --no-reuse to noReuse: true", async () => {
    mockDeploy.mockResolvedValue(undefined);
    run(["node", "universe", "static", "deploy", "--promote", "--no-reuse"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockDeploy).toHaveBeenCalledWith(expect.objectContaining({ noReuse: true }));
  });

  it("leaves noReuse false when --no-reuse is absent", async () => {
    mockDeploy.mockResolvedValue(undefined);
    run(["node", "universe", "static", "deploy", "--promote"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockDeploy).toHaveBeenCalledWith(expect.objectContaining({ noReuse: false }));
  });

  it("maps --allow-dirty to allowDirty on deploy, and defaults it false", async () => {
    mockDeploy.mockResolvedValue(undefined);
    run(["node", "universe", "static", "deploy", "--allow-dirty"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockDeploy).toHaveBeenCalledWith(expect.objectContaining({ allowDirty: true }));
    mockDeploy.mockClear();
    run(["node", "universe", "static", "deploy"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockDeploy).toHaveBeenCalledWith(expect.objectContaining({ allowDirty: false }));
  });

  it("maps --allow-dirty to allowDirty on promote, and defaults it false", async () => {
    mockPromote.mockResolvedValue(undefined);
    run(["node", "universe", "static", "promote", "--allow-dirty"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockPromote).toHaveBeenCalledWith(expect.objectContaining({ allowDirty: true }));
    mockPromote.mockClear();
    run(["node", "universe", "static", "promote"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockPromote).toHaveBeenCalledWith(expect.objectContaining({ allowDirty: false }));
  });

  it("routes the `ls` alias to the static list handler", async () => {
    mockStaticList.mockResolvedValue(undefined);
    run(["node", "universe", "static", "ls", "--site", "blog"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockStaticList).toHaveBeenCalledWith(expect.objectContaining({ site: "blog" }));
  });
});

describe("universe audit namespace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes the `ls` alias to the audit list handler", async () => {
    mockAuditList.mockResolvedValue(undefined);
    run(["node", "universe", "audit", "ls", "--actor", "alice"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockAuditList).toHaveBeenCalledWith(expect.objectContaining({ actor: "alice" }));
  });
});

describe("universe sites flag wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps --held to held, and defaults it false", async () => {
    mockSitesList.mockResolvedValue(undefined);
    run(["node", "universe", "sites", "list", "--held"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockSitesList).toHaveBeenCalledWith(expect.objectContaining({ held: true }));
    mockSitesList.mockClear();
    run(["node", "universe", "sites", "list"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockSitesList).toHaveBeenCalledWith(expect.objectContaining({ held: false }));
  });

  it("routes the `ls` alias to the sites list handler", async () => {
    mockSitesList.mockResolvedValue(undefined);
    run(["node", "universe", "sites", "ls", "--held"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockSitesList).toHaveBeenCalledWith(expect.objectContaining({ held: true }));
  });

  it("routes the `rm` alias to the sites remove handler", async () => {
    mockSitesRemove.mockResolvedValue(undefined);
    run(["node", "universe", "sites", "rm", "blog"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockSitesRemove).toHaveBeenCalledWith(expect.objectContaining({ slug: "blog" }));
  });

  it("maps --yes to yes on release, and defaults it false so the prompt still fires", async () => {
    mockSitesRelease.mockResolvedValue(undefined);
    run(["node", "universe", "sites", "release", "blog", "--yes"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockSitesRelease).toHaveBeenCalledWith(expect.objectContaining({ yes: true }));
    mockSitesRelease.mockClear();
    run(["node", "universe", "sites", "release", "blog"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockSitesRelease).toHaveBeenCalledWith(expect.objectContaining({ yes: false }));
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

  it("repo --help lists subcommands (create, list, approve, reject, status)", () => {
    run(["node", "universe", "repo", "--help"]);
    expect(output).toContain("create");
    expect(output).toContain("list|ls");
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
    mockRepoList.mockResolvedValue(undefined);
    run(["node", "universe", "--json", "repo", "list"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRepoList).toHaveBeenCalledWith(expect.objectContaining({ json: true }));
  });

  it("routes the `ls` alias to the repo list handler", async () => {
    mockRepoList.mockResolvedValue(undefined);
    run(["node", "universe", "repo", "ls", "--mine"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRepoList).toHaveBeenCalledWith(expect.objectContaining({ mine: true }));
  });

  it("routes the `rm` alias to the repo remove handler", async () => {
    mockRepoRemove.mockResolvedValue(undefined);
    run(["node", "universe", "repo", "rm", "req_001", "--yes"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRepoRemove).toHaveBeenCalledWith(expect.objectContaining({ id: "req_001" }));
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
