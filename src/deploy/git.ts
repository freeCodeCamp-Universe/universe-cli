import { execSync } from "node:child_process";

export interface GitState {
  hash: string | null;
  dirty: boolean;
  error?: string;
}

export function getGitState(): GitState {
  try {
    const hash = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    return { hash, dirty: status.length > 0 };
  } catch {
    return { hash: null, dirty: false, error: "not a git repository" };
  }
}
