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

  it("returns hash, branch, and dirty: false for clean repo", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse HEAD") return "abc1234def5678\n";
      if (cmd === "git status --porcelain") return "";
      if (cmd === "git rev-parse --abbrev-ref HEAD") return "main\n";
      return "";
    });

    const state = getGitState();
    expect(state).toEqual({
      hash: "abc1234def5678",
      branch: "main",
      dirty: false,
    });
  });

  it("returns hash, branch, and dirty: true when working tree has uncommitted changes", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse HEAD") return "abc1234def5678\n";
      if (cmd === "git status --porcelain") return " M src/file.ts\n";
      if (cmd === "git rev-parse --abbrev-ref HEAD") return "feature-x\n";
      return "";
    });

    const state = getGitState();
    expect(state).toEqual({
      hash: "abc1234def5678",
      branch: "feature-x",
      dirty: true,
    });
  });

  it("returns null hash and null branch with error when not in a git repo", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("fatal: not a git repository");
    });

    const state = getGitState();
    expect(state).toEqual({
      hash: null,
      branch: null,
      dirty: false,
      error: "not a git repository",
    });
  });

  it("trims whitespace from git hash and branch", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse HEAD") return "  fedcba9876543  \n";
      if (cmd === "git status --porcelain") return "";
      if (cmd === "git rev-parse --abbrev-ref HEAD") return "  main  \n";
      return "";
    });

    const state = getGitState();
    expect(state.hash).toBe("fedcba9876543");
    expect(state.branch).toBe("main");
  });
});
