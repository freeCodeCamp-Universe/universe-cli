import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface PreflightResult {
  valid: boolean;
  fileCount: number;
  error?: string;
}

export function validateOutputDir(dir: string): PreflightResult {
  if (!existsSync(dir)) {
    return { valid: false, fileCount: 0, error: "directory not found" };
  }

  if (!statSync(dir).isDirectory()) {
    return { valid: false, fileCount: 0, error: "not a directory" };
  }

  const fileCount = countFiles(dir);
  if (fileCount === 0) {
    return { valid: false, fileCount: 0, error: "directory is empty" };
  }

  return { valid: true, fileCount };
}

function countFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      count++;
    } else if (entry.isDirectory()) {
      count += countFiles(join(dir, entry.name));
    }
  }
  return count;
}
