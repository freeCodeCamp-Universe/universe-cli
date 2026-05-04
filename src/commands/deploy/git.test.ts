import { execSync } from "node:child_process";
import { getGitState } from "./git.js";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
vi.mock<typeof import("node:child_process")>(import("node:child_process"), () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

describe(getGitState, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns hash and dirty: false for clean repo", () => {
    mockedExecSync.mockReturnValueOnce("abc1234def5678\n").mockReturnValueOnce("");
    const state = getGitState();
    expect(state).toStrictEqual({ dirty: false, hash: "abc1234def5678" });
  });

  it("returns hash and dirty: true when working tree has uncommitted changes", () => {
    mockedExecSync.mockReturnValueOnce("abc1234def5678\n").mockReturnValueOnce(" M src/file.ts\n");
    const state = getGitState();
    expect(state).toStrictEqual({ dirty: true, hash: "abc1234def5678" });
  });

  it("returns null hash with error when not in a git repo", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("fatal: not a git repository");
    });
    const state = getGitState();
    expect(state).toStrictEqual({
      dirty: false,
      error: "not a git repository",
      hash: null,
    });
  });

  it("trims whitespace from git hash", () => {
    mockedExecSync.mockReturnValueOnce("  fedcba9876543  \n").mockReturnValueOnce("");
    const state = getGitState();
    expect(state.hash).toBe("fedcba9876543");
  });
});
