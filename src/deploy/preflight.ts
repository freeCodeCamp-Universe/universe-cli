import { existsSync, statSync } from "node:fs";
import { StorageError } from "../errors.js";
import { walkFiles } from "./walk.js";

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

  let fileCount: number;
  try {
    fileCount = walkFiles(dir).length;
  } catch (err: unknown) {
    if (err instanceof StorageError) {
      return { valid: false, fileCount: 0, error: err.message };
    }
    throw err;
  }

  if (fileCount === 0) {
    return { valid: false, fileCount: 0, error: "directory is empty" };
  }

  return { valid: true, fileCount };
}
