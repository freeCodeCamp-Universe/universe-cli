import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { UsageError } from "@freecodecamp/universe-core";
import type { ProjectWriter } from "./project-writer.port.js";

interface FilesystemApi {
  mkdir: typeof mkdir;
  rm: typeof rm;
  symlink: typeof symlink;
  writeFile: typeof writeFile;
}

const defaultFilesystemApi: FilesystemApi = {
  mkdir,
  rm,
  symlink,
  writeFile,
};

class LocalProjectWriter implements ProjectWriter {
  private readonly filesystem: FilesystemApi;

  constructor(filesystem: FilesystemApi = defaultFilesystemApi) {
    this.filesystem = filesystem;
  }

  async createSymlinks(targetDirectory: string, symlinks: Record<string, string>): Promise<void> {
    try {
      await Promise.all(
        Object.entries(symlinks).map(async ([relativePath, target]) => {
          const linkPath = join(targetDirectory, relativePath);

          await this.filesystem.mkdir(dirname(linkPath), { recursive: true });
          await this.filesystem.symlink(target, linkPath);
        }),
      );
    } catch (error) {
      await this.filesystem.rm(targetDirectory, { force: true, recursive: true });

      throw new UsageError(
        `Failed to create symlinks in "${targetDirectory}": ${(error as Error).message}`,
      );
    }
  }

  async writeProject(targetDirectory: string, files: Record<string, string>): Promise<void> {
    try {
      await this.filesystem.mkdir(targetDirectory, { recursive: true });

      await Promise.all(
        Object.entries(files)
          .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
          .map(async ([relativePath, content]) => {
            const filePath = join(targetDirectory, relativePath);

            await this.filesystem.mkdir(dirname(filePath), { recursive: true });
            await this.filesystem.writeFile(filePath, content, "utf8");
          }),
      );
    } catch (error) {
      await this.filesystem.rm(targetDirectory, { force: true, recursive: true });

      throw new UsageError(
        `Failed to write scaffold to "${targetDirectory}": ${(error as Error).message}`,
      );
    }
  }
}

export { LocalProjectWriter };
export type { FilesystemApi };
