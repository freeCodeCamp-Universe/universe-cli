import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ScaffoldWriteError } from "../errors/cli-errors.js";
import type { FilesystemWriter } from "./filesystem-writer.port.js";

interface FilesystemApi {
  mkdir: typeof mkdir;
  rm: typeof rm;
  writeFile: typeof writeFile;
}

const defaultFilesystemApi: FilesystemApi = {
  mkdir,
  rm,
  writeFile,
};

class LocalFilesystemWriter implements FilesystemWriter {
  private readonly filesystem: FilesystemApi;

  constructor(filesystem: FilesystemApi = defaultFilesystemApi) {
    this.filesystem = filesystem;
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

      throw new ScaffoldWriteError(targetDirectory, error as Error);
    }
  }
}

export { LocalFilesystemWriter };
export type { FilesystemApi };
