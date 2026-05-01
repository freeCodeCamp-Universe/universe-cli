import { readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { StorageError } from "../../errors/cli-errors.js";

interface WalkedFile {
  relPath: string;
  absPath: string;
}

const walkFiles = (base: string): WalkedFile[] => {
  const baseReal = realpathSync(base);
  const entries = readdirSync(base, { recursive: true, withFileTypes: true });

  const files: WalkedFile[] = [];
  for (const entry of entries) {
    const full = join(entry.parentPath, entry.name);
    const relPath = relative(base, full);

    let targetIsFile: boolean;
    try {
      targetIsFile = statSync(full).isFile();
    } catch {
      throw new StorageError(`"${relPath}" could not be stat'd (dangling symlink?)`);
    }

    if (targetIsFile) {
      let resolved: string;
      try {
        resolved = realpathSync(full);
      } catch {
        throw new StorageError(`"${relPath}" could not be resolved (dangling symlink?)`);
      }
      const rel = relative(baseReal, resolved);
      if (rel === ".." || rel.startsWith(`..${sep}`)) {
        throw new StorageError(
          `"${relPath}" resolves outside the output directory (symlink escape). Resolved to: ${resolved}`,
        );
      }
      files.push({ absPath: full, relPath });
    }
  }
  return files;
};

export { walkFiles, type WalkedFile };
