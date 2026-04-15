import { GitError } from "../errors.js";

export function generateDeployId(gitHash?: string, force = false): string {
  if (gitHash === undefined) {
    if (!force) {
      throw new GitError("git hash is required unless --force is set");
    }
    return formatId("nogit");
  }
  return formatId(gitHash.slice(0, 7));
}

function formatId(suffix: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}-${h}${mi}${s}-${suffix}`;
}
