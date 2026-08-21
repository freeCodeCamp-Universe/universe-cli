import { describe, it, expect, vi, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { getGitState } from "../../src/deploy/git.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

describe("getGitState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns hash and dirty: false for clean repo", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse HEAD") return "abc1234def5678\n";
      if (cmd === "git status --porcelain") return "";
      return "";
    });

    const state = getGitState("/repo");
    expect(state).toEqual({ hash: "abc1234def5678", dirty: false });
  });

  it("returns hash and dirty: true when working tree has uncommitted changes", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse HEAD") return "abc1234def5678\n";
      if (cmd === "git status --porcelain") return " M src/file.ts\n";
      return "";
    });

    const state = getGitState("/repo");
    expect(state).toEqual({ hash: "abc1234def5678", dirty: true });
  });

  it("never lets git write to the parent stderr", () => {
    const seen: Array<{ stdio?: unknown }> = [];
    mockedExecSync.mockImplementation((cmd: string, opts?: { stdio?: unknown }) => {
      seen.push({ stdio: opts?.stdio });
      if (cmd === "git rev-parse HEAD") return "abc1234def5678\n";
      return "";
    });

    getGitState("/repo");

    expect(seen.length).toBeGreaterThan(0);
    for (const call of seen) {
      expect(call.stdio).toEqual(["ignore", "pipe", "ignore"]);
    }
  });

  it("returns a null hash when not in a repo", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("fatal: not a git repository (or any of the parent directories): .git");
    });

    expect(getGitState("/repo")).toEqual({ hash: null, dirty: false });
  });

  it("returns a null hash when the directory does not exist", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("spawnSync /bin/sh ENOENT");
    });

    expect(getGitState("/no/such/dir")).toEqual({ hash: null, dirty: false });
  });

  it("returns a null hash on a non-Error throw", () => {
    mockedExecSync.mockImplementation(() => {
      throw "git exploded";
    });

    expect(getGitState("/repo")).toEqual({ hash: null, dirty: false });
  });

  it("trims whitespace from git hash", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse HEAD") return "  fedcba9876543  \n";
      if (cmd === "git status --porcelain") return "";
      return "";
    });

    const state = getGitState("/repo");
    expect(state.hash).toBe("fedcba9876543");
  });
  it("reads git state from the given directory, not process.cwd()", () => {
    const seen: Array<{ cmd: string; cwd: unknown }> = [];
    mockedExecSync.mockImplementation((cmd: string, opts?: { cwd?: string | URL }) => {
      seen.push({ cmd, cwd: opts?.cwd });
      if (cmd === "git rev-parse HEAD") return "abc1234def5678\n";
      return "";
    });

    getGitState("/some/project/dir");

    expect(seen.length).toBeGreaterThan(0);
    for (const call of seen) {
      expect(call.cwd).toBe("/some/project/dir");
    }
  });
});
