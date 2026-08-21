import { execSync, type StdioOptions } from "node:child_process";

const GIT_STDIO: StdioOptions = ["ignore", "pipe", "ignore"];

export interface GitState {
  hash: string | null;
  dirty: boolean;
}

export function getGitState(cwd: string): GitState {
  try {
    const hash = execSync("git rev-parse HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: GIT_STDIO,
    }).trim();
    const status = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
      stdio: GIT_STDIO,
    });
    return { hash, dirty: status.length > 0 };
  } catch {
    return { hash: null, dirty: false };
  }
}
