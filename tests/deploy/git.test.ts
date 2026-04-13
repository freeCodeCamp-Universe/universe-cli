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

    const state = getGitState();
    expect(state).toEqual({ hash: "abc1234def5678", dirty: false });
  });

  it("returns hash and dirty: true when working tree has uncommitted changes", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse HEAD") return "abc1234def5678\n";
      if (cmd === "git status --porcelain") return " M src/file.ts\n";
      return "";
    });

    const state = getGitState();
    expect(state).toEqual({ hash: "abc1234def5678", dirty: true });
  });

  it("returns null hash with error when not in a git repo", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("fatal: not a git repository");
    });

    const state = getGitState();
    expect(state).toEqual({
      hash: null,
      dirty: false,
      error: "not a git repository",
    });
  });

  it("trims whitespace from git hash", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse HEAD") return "  fedcba9876543  \n";
      if (cmd === "git status --porcelain") return "";
      return "";
    });

    const state = getGitState();
    expect(state.hash).toBe("fedcba9876543");
  });
});
