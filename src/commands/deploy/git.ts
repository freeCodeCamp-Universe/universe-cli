import { execSync } from "node:child_process";

interface GitState {
  hash: string | null;
  dirty: boolean;
  error?: string;
}

const getGitState = (): GitState => {
  try {
    const hash = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    return { dirty: status.length > 0, hash };
  } catch {
    return { dirty: false, error: "not a git repository", hash: null };
  }
};

export { getGitState, type GitState };
