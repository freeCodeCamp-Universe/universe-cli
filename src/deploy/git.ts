import { execSync } from "node:child_process";

export interface GitState {
  hash: string | null;
  branch: string | null;
  dirty: boolean;
  error?: string;
}

export function getGitState(): GitState {
  try {
    const hash = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
    }).trim();
    return { hash, branch, dirty: status.length > 0 };
  } catch {
    return {
      hash: null,
      branch: null,
      dirty: false,
      error: "not a git repository",
    };
  }
}
